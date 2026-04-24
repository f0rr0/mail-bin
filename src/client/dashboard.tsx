import { useDeferredValue, useEffect, useId, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { flexRender, getCoreRowModel, useReactTable } from "@tanstack/react-table";
import type { ColumnDef, Row } from "@tanstack/react-table";
import { format, formatDistanceToNowStrict } from "date-fns";
import {
	AtSignIcon,
	ForwardIcon,
	GlobeIcon,
	HistoryIcon,
	InboxIcon,
	LoaderCircleIcon,
	MailPlusIcon,
	TagsIcon,
} from "lucide-react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";

import { api, queryKeys } from "@/client/lib/api";
import { cn } from "@/lib/utils";
import {
	CreateAliasInputSchema,
	CreateDestinationInputSchema,
	CreateDomainInputSchema,
	UpdateAliasInputSchema,
} from "@/shared/schemas";
import type {
	Alias,
	CreateAliasInput,
	CreateDestinationInput,
	CreateDomainInput,
	DeliveryEvent,
	Destination,
	Domain,
	UpdateAliasInput,
} from "@/shared/schemas";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardAction,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@/components/ui/empty";
import {
	Field,
	FieldContent,
	FieldDescription,
	FieldError,
	FieldGroup,
	FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetFooter,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";

interface DestinationUsage {
	defaultCount: number;
	overrideCount: number;
}

type DestinationFormValues = z.input<typeof CreateDestinationInputSchema>;
type DomainFormValues = z.input<typeof CreateDomainInputSchema>;
type AliasCreateFormValues = z.input<typeof CreateAliasInputSchema>;
type AliasUpdateFormValues = z.input<typeof UpdateAliasInputSchema>;

function getDestinationUsage(domains: Domain[], aliases: Alias[]): Map<string, DestinationUsage> {
	const usage = new Map<string, DestinationUsage>();

	const increment = (destinationId: string, key: keyof DestinationUsage) => {
		const current = usage.get(destinationId) ?? {
			defaultCount: 0,
			overrideCount: 0,
		};
		current[key] += 1;
		usage.set(destinationId, current);
	};

	for (const domain of domains) {
		for (const destination of domain.defaultDestinations) {
			increment(destination.id, "defaultCount");
		}
	}

	for (const alias of aliases) {
		for (const destination of alias.overrideDestinations) {
			increment(destination.id, "overrideCount");
		}
	}

	return usage;
}

function formatTimestamp(value: string) {
	return format(new Date(value), "dd MMM yyyy, HH:mm");
}

function formatRelativeTimestamp(value: string) {
	return formatDistanceToNowStrict(new Date(value), {
		addSuffix: true,
	});
}

function getDomainStatusVariant(status: Domain["status"]) {
	switch (status) {
		case "active": {
			return "default";
		}
		case "misconfigured": {
			return "destructive";
		}
		default: {
			return "outline";
		}
	}
}

function getDestinationVerificationVariant(status: Destination["verificationStatus"]) {
	return status === "verified" ? "default" : "outline";
}

function getDeliveryStatusVariant(event: DeliveryEvent["status"]) {
	if (event.startsWith("rejected") || event === "processing_error") {
		return "destructive";
	}

	return event === "partial_failure" ? "outline" : "default";
}

function formatDeliveryStatus(status: DeliveryEvent["status"]) {
	return status.replaceAll("_", " ");
}

function StatCard({
	label,
	value,
	icon: Icon,
}: {
	label: string;
	value: string;
	icon: React.ComponentType<{ className?: string }>;
}) {
	return (
		<Card className="h-full gap-0 border-0 bg-card/90 py-0 shadow-none ring-0" size="sm">
			<CardContent className="flex min-h-24 items-center justify-between gap-4">
				<div className="min-w-0">
					<CardDescription className="truncate font-mono text-[0.68rem] uppercase tracking-[0.24em]">
						{label}
					</CardDescription>
					<CardTitle className="mt-2 font-mono text-3xl font-semibold tracking-tight">
						{value}
					</CardTitle>
				</div>
				<div className="flex size-10 shrink-0 items-center justify-center border border-border bg-muted/45 text-muted-foreground">
					<Icon className="size-4" />
				</div>
			</CardContent>
		</Card>
	);
}

function PillSelector({
	label,
	description,
	value,
	onChange,
	options,
	emptyText,
}: {
	label: string;
	description: string;
	value: string[];
	onChange: (next: string[]) => void;
	options: {
		id: string;
		label: string;
		description: string;
		tone?: "default" | "outline";
	}[];
	emptyText: string;
}) {
	return (
		<Field>
			<FieldLabel>{label}</FieldLabel>
			<FieldContent>
				<FieldDescription>{description}</FieldDescription>
				{options.length === 0 ? (
					<Alert>
						<AlertTitle>No options available</AlertTitle>
						<AlertDescription>{emptyText}</AlertDescription>
					</Alert>
				) : (
					<div className="flex flex-wrap gap-2">
						{options.map((option) => {
							const selected = value.includes(option.id);
							return (
								<button
									aria-pressed={selected}
									className={cn(
										"flex min-w-[12rem] flex-col rounded-2xl border px-3 py-2 text-left transition outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
										selected
											? "border-primary/60 bg-primary/12 text-primary"
											: "border-border/80 bg-background/55 hover:border-primary/35 hover:bg-muted/60",
									)}
									key={option.id}
									onClick={() => {
										onChange(
											selected ? value.filter((id) => id !== option.id) : [...value, option.id],
										);
									}}
									type="button"
								>
									<div className="flex items-center gap-2">
										<span className="text-sm font-medium text-foreground">{option.label}</span>
										<Badge variant={selected ? "default" : (option.tone ?? "outline")}>
											{selected ? "selected" : "ready"}
										</Badge>
									</div>
									<span className="mt-1 text-xs leading-5 text-muted-foreground">
										{option.description}
									</span>
								</button>
							);
						})}
					</div>
				)}
			</FieldContent>
		</Field>
	);
}

function ContentLoadingSkeleton() {
	return (
		<div aria-hidden="true" className="flex min-h-36 flex-1 items-center justify-center p-6">
			<div className="flex flex-col items-center gap-3">
				<Skeleton className="size-8 border border-border bg-muted/45" />
				<Skeleton className="h-3 w-24" />
				<Skeleton className="h-3 w-44 opacity-60" />
			</div>
		</div>
	);
}

function DataTableCard<TData>({
	title,
	description,
	data,
	columns,
	isLoading,
	toolbar,
	emptyTitle,
	emptyDescription,
	emptyIcon: EmptyIcon,
}: {
	title: string;
	description: string;
	data: TData[];
	columns: ColumnDef<TData>[];
	isLoading: boolean;
	toolbar?: React.ReactNode;
	emptyTitle: string;
	emptyDescription: string;
	emptyIcon: React.ComponentType<{ className?: string }>;
}) {
	const table = useReactTable({
		columns,
		data,
		getCoreRowModel: getCoreRowModel(),
	});

	let tableContent: React.ReactNode;

	if (isLoading) {
		tableContent = <ContentLoadingSkeleton />;
	} else if (data.length === 0) {
		tableContent = (
			<Empty className="min-h-36 gap-3 border-0 bg-transparent p-6">
				<EmptyHeader className="gap-1">
					<EmptyMedia variant="icon">
						<EmptyIcon />
					</EmptyMedia>
					<EmptyTitle>{emptyTitle}</EmptyTitle>
					<EmptyDescription>{emptyDescription}</EmptyDescription>
				</EmptyHeader>
			</Empty>
		);
	} else {
		tableContent = (
			<Table>
				<TableHeader>
					{table.getHeaderGroups().map((headerGroup) => (
						<TableRow key={headerGroup.id}>
							{headerGroup.headers.map((header) => (
								<TableHead key={header.id}>
									{header.isPlaceholder
										? null
										: flexRender(header.column.columnDef.header, header.getContext())}
								</TableHead>
							))}
						</TableRow>
					))}
				</TableHeader>
				<TableBody>
					{table.getRowModel().rows.map((row) => (
						<TableRow key={row.id}>
							{row.getVisibleCells().map((cell) => (
								<TableCell className="align-top" key={cell.id}>
									{flexRender(cell.column.columnDef.cell, cell.getContext())}
								</TableCell>
							))}
						</TableRow>
					))}
				</TableBody>
			</Table>
		);
	}

	return (
		<Card className="h-full w-full gap-0 border-0 bg-card/90 py-0 shadow-none ring-0">
			<CardHeader className="min-h-20 border-b border-border/70 pt-3 !pb-3">
				<div className="flex min-w-0 flex-col gap-1">
					<CardTitle className="tracking-tight">{title}</CardTitle>
					<CardDescription className="max-w-xl text-sm leading-5">{description}</CardDescription>
				</div>
				{toolbar ? <CardAction>{toolbar}</CardAction> : null}
			</CardHeader>
			<CardContent className="flex flex-1 overflow-x-auto p-0">{tableContent}</CardContent>
		</Card>
	);
}

function InboxList({ items }: { items: Destination[] }) {
	if (items.length === 0) {
		return <span className="text-sm text-muted-foreground">No destinations</span>;
	}

	return (
		<div className="flex flex-wrap gap-1.5">
			{items.map((destination) => (
				<Badge key={destination.id} variant="outline">
					{destination.label}
				</Badge>
			))}
		</div>
	);
}

function ActionButton({
	isWorking,
	children,
	...props
}: React.ComponentProps<typeof Button> & {
	isWorking?: boolean;
}) {
	return (
		<Button {...props}>
			{isWorking ? <LoaderCircleIcon className="animate-spin" data-icon="inline-start" /> : null}
			{children}
		</Button>
	);
}

function AliasActionCell({
	row,
	onEdit,
	onQuickStateChange,
	isBusy,
}: {
	row: Row<Alias>;
	onEdit: (alias: Alias) => void;
	onQuickStateChange: (alias: Alias) => void;
	isBusy: boolean;
}) {
	const alias = row.original;

	return (
		<div className="flex flex-wrap items-center gap-2">
			<Button onClick={() => onEdit(alias)} size="sm" variant="outline">
				Edit
			</Button>
			<ActionButton
				isWorking={isBusy}
				onClick={() => onQuickStateChange(alias)}
				size="sm"
				variant={alias.active ? "ghost" : "outline"}
			>
				{alias.active ? "Disable" : "Enable"}
			</ActionButton>
		</div>
	);
}

function DestinationSheet({
	open,
	onOpenChange,
	isSubmitting,
	onSubmit,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	isSubmitting: boolean;
	onSubmit: (values: CreateDestinationInput) => Promise<void>;
}) {
	const emailId = useId();
	const labelId = useId();
	const form = useForm<DestinationFormValues>({
		defaultValues: {
			email: "",
			enabled: true,
			label: "",
		},
		resolver: zodResolver(CreateDestinationInputSchema),
	});

	useEffect(() => {
		if (!open) {
			form.reset({
				email: "",
				enabled: true,
				label: "",
			});
		}
	}, [form, open]);

	return (
		<Sheet onOpenChange={onOpenChange} open={open}>
			<SheetContent className="overflow-y-auto sm:max-w-xl">
				<SheetHeader>
					<SheetTitle>Add inbox</SheetTitle>
					<SheetDescription>Add a mailbox that should receive forwarded mail.</SheetDescription>
				</SheetHeader>
				<form
					className="flex flex-1 flex-col"
					onSubmit={form.handleSubmit(async (values) => {
						await onSubmit(CreateDestinationInputSchema.parse(values));
					})}
				>
					<div className="flex-1 px-4 pb-4">
						<FieldGroup>
							<Field>
								<FieldLabel htmlFor={emailId}>Primary inbox</FieldLabel>
								<FieldContent>
									<Input
										id={emailId}
										placeholder="ops@your-real-inbox.com"
										{...form.register("email")}
									/>
									<FieldDescription>
										Cloudflare may send a verification email before this inbox can receive mail.
									</FieldDescription>
									<FieldError errors={[form.formState.errors.email]} />
								</FieldContent>
							</Field>
							<Field>
								<FieldLabel htmlFor={labelId}>Label</FieldLabel>
								<FieldContent>
									<Input id={labelId} placeholder="Personal Gmail" {...form.register("label")} />
									<FieldDescription>A short name for this inbox in the dashboard.</FieldDescription>
									<FieldError errors={[form.formState.errors.label]} />
								</FieldContent>
							</Field>
							<Field orientation="horizontal">
								<FieldLabel>Enabled</FieldLabel>
								<FieldContent>
									<Controller
										control={form.control}
										name="enabled"
										render={({ field }) => (
											<div className="flex items-center gap-3 rounded-2xl border border-border/80 bg-background/55 px-3 py-2">
												<Switch checked={field.value} onCheckedChange={field.onChange} />
												<div className="text-sm text-muted-foreground">
													Use this inbox after verification succeeds.
												</div>
											</div>
										)}
									/>
								</FieldContent>
							</Field>
						</FieldGroup>
					</div>
					<SheetFooter className="border-t border-border/70 bg-background/80">
						<ActionButton isWorking={isSubmitting} type="submit">
							Add inbox
						</ActionButton>
					</SheetFooter>
				</form>
			</SheetContent>
		</Sheet>
	);
}

function DomainSheet({
	open,
	onOpenChange,
	destinations,
	isSubmitting,
	onSubmit,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	destinations: Destination[];
	isSubmitting: boolean;
	onSubmit: (values: CreateDomainInput) => Promise<void>;
}) {
	const fqdnId = useId();
	const zoneId = useId();
	const form = useForm<DomainFormValues>({
		defaultValues: {
			defaultDestinationIds: [],
			fqdn: "",
			status: "pending",
			zoneId: "",
		},
		resolver: zodResolver(CreateDomainInputSchema),
	});

	useEffect(() => {
		if (!open) {
			form.reset({
				defaultDestinationIds: [],
				fqdn: "",
				status: "pending",
				zoneId: "",
			});
		}
	}, [form, open]);

	return (
		<Sheet onOpenChange={onOpenChange} open={open}>
			<SheetContent className="overflow-y-auto sm:max-w-xl">
				<SheetHeader>
					<SheetTitle>Add domain</SheetTitle>
					<SheetDescription>Add a domain or subdomain you control.</SheetDescription>
				</SheetHeader>
				<form
					className="flex flex-1 flex-col"
					onSubmit={form.handleSubmit(async (values) => {
						await onSubmit(CreateDomainInputSchema.parse(values));
					})}
				>
					<div className="flex-1 px-4 pb-4">
						<FieldGroup>
							<Field>
								<FieldLabel htmlFor={fqdnId}>FQDN</FieldLabel>
								<FieldContent>
									<Input id={fqdnId} placeholder="drop.example.com" {...form.register("fqdn")} />
									<FieldDescription>
										Use the domain where you want to create disposable addresses.
									</FieldDescription>
									<FieldError errors={[form.formState.errors.fqdn]} />
								</FieldContent>
							</Field>
							<Field>
								<FieldLabel htmlFor={zoneId}>Cloudflare zone ID</FieldLabel>
								<FieldContent>
									<Input id={zoneId} placeholder="your-zone-id" {...form.register("zoneId")} />
									<FieldDescription>
										Find this on the Cloudflare domain overview page.
									</FieldDescription>
									<FieldError errors={[form.formState.errors.zoneId]} />
								</FieldContent>
							</Field>
							<Field>
								<FieldLabel>Status</FieldLabel>
								<FieldContent>
									<Controller
										control={form.control}
										name="status"
										render={({ field }) => (
											<Select onValueChange={field.onChange} value={field.value}>
												<SelectTrigger className="w-full">
													<SelectValue placeholder="Choose status" />
												</SelectTrigger>
												<SelectContent>
													<SelectItem value="pending">Pending</SelectItem>
													<SelectItem value="active">Active</SelectItem>
													<SelectItem value="misconfigured">Misconfigured</SelectItem>
												</SelectContent>
											</Select>
										)}
									/>
									<FieldDescription>
										Keep this pending until the domain is ready to receive mail.
									</FieldDescription>
								</FieldContent>
							</Field>
							<Controller
								control={form.control}
								name="defaultDestinationIds"
								render={({ field }) => (
									<PillSelector
										description="These inboxes receive mail when an alias uses domain defaults."
										emptyText="Create at least one destination inbox first."
										label="Default inboxes"
										onChange={field.onChange}
										options={destinations.map((destination) => ({
											description: destination.email,
											id: destination.id,
											label: destination.label,
											tone: destination.verificationStatus === "verified" ? "default" : "outline",
										}))}
										value={field.value ?? []}
									/>
								)}
							/>
						</FieldGroup>
					</div>
					<SheetFooter className="border-t border-border/70 bg-background/80">
						<ActionButton isWorking={isSubmitting} type="submit">
							Add domain
						</ActionButton>
					</SheetFooter>
				</form>
			</SheetContent>
		</Sheet>
	);
}

function AliasSheet({
	open,
	onOpenChange,
	alias,
	domains,
	destinations,
	isSubmitting,
	onCreate,
	onUpdate,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	alias: Alias | null;
	domains: Domain[];
	destinations: Destination[];
	isSubmitting: boolean;
	onCreate: (values: CreateAliasInput) => Promise<void>;
	onUpdate: (values: UpdateAliasInput) => Promise<void>;
}) {
	const localPartId = useId();
	const labelId = useId();
	const createdForId = useId();
	const createForm = useForm<AliasCreateFormValues>({
		defaultValues: {
			active: true,
			createdFor: "",
			domainId: domains[0]?.id ?? "",
			label: "",
			localPart: "",
			overrideDestinationIds: [],
			routingMode: "domain_default",
		},
		resolver: zodResolver(CreateAliasInputSchema),
	});
	const updateForm = useForm<AliasUpdateFormValues>({
		defaultValues: {
			active: alias?.active ?? true,
			createdFor: alias?.createdFor ?? "",
			id: alias?.id ?? "",
			label: alias?.label ?? "",
			overrideDestinationIds:
				alias?.overrideDestinations.map((destination) => destination.id) ?? [],
			routingMode: alias?.routingMode ?? "domain_default",
		},
		resolver: zodResolver(UpdateAliasInputSchema),
	});
	const isEditing = alias !== null;
	const selectedDomainId = createForm.watch("domainId");
	const selectedRoutingMode = isEditing
		? updateForm.watch("routingMode")
		: createForm.watch("routingMode");
	const selectedDomain = domains.find((domain) => domain.id === selectedDomainId);

	useEffect(() => {
		if (!open) {
			createForm.reset({
				active: true,
				createdFor: "",
				domainId: domains[0]?.id ?? "",
				label: "",
				localPart: "",
				overrideDestinationIds: [],
				routingMode: "domain_default",
			});
			updateForm.reset({
				active: alias?.active ?? true,
				createdFor: alias?.createdFor ?? "",
				id: alias?.id ?? "",
				label: alias?.label ?? "",
				overrideDestinationIds:
					alias?.overrideDestinations.map((destination) => destination.id) ?? [],
				routingMode: alias?.routingMode ?? "domain_default",
			});
		}
	}, [alias, createForm, domains, open, updateForm]);

	useEffect(() => {
		if (selectedRoutingMode === "domain_default") {
			if (isEditing) {
				updateForm.setValue("overrideDestinationIds", []);
			} else {
				createForm.setValue("overrideDestinationIds", []);
			}
		}
	}, [createForm, isEditing, selectedRoutingMode, updateForm]);
	const currentOverrideIds = isEditing
		? (updateForm.watch("overrideDestinationIds") ?? [])
		: (createForm.watch("overrideDestinationIds") ?? []);
	const shouldShowMissingDefaultDestinations =
		!isEditing &&
		selectedRoutingMode === "domain_default" &&
		!selectedDomain?.defaultDestinations.length;

	return (
		<Sheet onOpenChange={onOpenChange} open={open}>
			<SheetContent className="overflow-y-auto sm:max-w-xl">
				<SheetHeader>
					<SheetTitle>{isEditing ? "Edit alias" : "Create alias"}</SheetTitle>
					<SheetDescription>
						{isEditing
							? "Change its label, routing, or active state."
							: "Create an address to use with an app or service."}
					</SheetDescription>
				</SheetHeader>
				<form
					className="flex flex-1 flex-col"
					onSubmit={
						isEditing
							? updateForm.handleSubmit(async (values) => {
									await onUpdate(UpdateAliasInputSchema.parse(values));
								})
							: createForm.handleSubmit(async (values) => {
									await onCreate(CreateAliasInputSchema.parse(values));
								})
					}
				>
					<div className="flex-1 px-4 pb-4">
						<FieldGroup>
							{isEditing ? (
								<Card className="border-border/80 bg-background/55">
									<CardContent className="p-4">
										<p className="text-xs uppercase tracking-[0.26em] text-muted-foreground">
											Address
										</p>
										<p className="mt-2 text-lg font-medium text-foreground">
											{alias.localPart}@{alias.domainFqdn}
										</p>
										<p className="mt-2 text-sm leading-6 text-muted-foreground">
											The address itself is locked after creation.
										</p>
									</CardContent>
								</Card>
							) : (
								<>
									<Field>
										<FieldLabel>Domain</FieldLabel>
										<FieldContent>
											<Controller
												control={createForm.control}
												name="domainId"
												render={({ field }) => (
													<Select onValueChange={field.onChange} value={field.value}>
														<SelectTrigger className="w-full">
															<SelectValue placeholder="Choose domain" />
														</SelectTrigger>
														<SelectContent>
															{domains.map((domain) => (
																<SelectItem key={domain.id} value={domain.id}>
																	{domain.fqdn}
																</SelectItem>
															))}
														</SelectContent>
													</Select>
												)}
											/>
											<FieldDescription>Choose where this alias should live.</FieldDescription>
											<FieldError errors={[createForm.formState.errors.domainId]} />
										</FieldContent>
									</Field>
									<Field>
										<FieldLabel htmlFor={localPartId}>Local part</FieldLabel>
										<FieldContent>
											<Input
												id={localPartId}
												placeholder="notion-3f8k2p"
												{...createForm.register("localPart")}
											/>
											<FieldDescription>
												This becomes the part before `@`. Plus tags continue to resolve to the same
												alias.
											</FieldDescription>
											<FieldError errors={[createForm.formState.errors.localPart]} />
										</FieldContent>
									</Field>
								</>
							)}
							<Field>
								<FieldLabel htmlFor={labelId}>Label</FieldLabel>
								<FieldContent>
									<Input
										id={labelId}
										placeholder="Notion login"
										{...(isEditing ? updateForm.register("label") : createForm.register("label"))}
									/>
									<FieldDescription>A short name for this alias.</FieldDescription>
									<FieldError
										errors={[
											isEditing
												? updateForm.formState.errors.label
												: createForm.formState.errors.label,
										]}
									/>
								</FieldContent>
							</Field>
							<Field>
								<FieldLabel htmlFor={createdForId}>Created for</FieldLabel>
								<FieldContent>
									<Input
										id={createdForId}
										placeholder="Notion"
										{...(isEditing
											? updateForm.register("createdFor")
											: createForm.register("createdFor"))}
									/>
									<FieldDescription>
										The app, account, or service using this address.
									</FieldDescription>
									<FieldError
										errors={[
											isEditing
												? updateForm.formState.errors.createdFor
												: createForm.formState.errors.createdFor,
										]}
									/>
								</FieldContent>
							</Field>
							<Field>
								<FieldLabel>Routing mode</FieldLabel>
								<FieldContent>
									{isEditing ? (
										<Controller
											control={updateForm.control}
											name="routingMode"
											render={({ field }) => (
												<Select onValueChange={field.onChange} value={field.value}>
													<SelectTrigger className="w-full">
														<SelectValue placeholder="Choose routing mode" />
													</SelectTrigger>
													<SelectContent>
														<SelectItem value="domain_default">Use domain inboxes</SelectItem>
														<SelectItem value="override">Choose inboxes</SelectItem>
													</SelectContent>
												</Select>
											)}
										/>
									) : (
										<Controller
											control={createForm.control}
											name="routingMode"
											render={({ field }) => (
												<Select onValueChange={field.onChange} value={field.value}>
													<SelectTrigger className="w-full">
														<SelectValue placeholder="Choose routing mode" />
													</SelectTrigger>
													<SelectContent>
														<SelectItem value="domain_default">Use domain inboxes</SelectItem>
														<SelectItem value="override">Choose inboxes</SelectItem>
													</SelectContent>
												</Select>
											)}
										/>
									)}
									<FieldDescription>
										Use the domain defaults, or choose a different inbox set for this alias.
									</FieldDescription>
								</FieldContent>
							</Field>
							{isEditing ? (
								<Controller
									control={updateForm.control}
									name="overrideDestinationIds"
									render={({ field }) => (
										<PillSelector
											description={
												selectedRoutingMode === "override"
													? "Choose the inboxes that should receive this alias."
													: "Switch to Choose inboxes if this alias needs different recipients."
											}
											emptyText="Create at least one destination inbox first."
											label="Alias inboxes"
											onChange={field.onChange}
											options={destinations.map((destination) => ({
												description: destination.email,
												id: destination.id,
												label: destination.label,
												tone: destination.verificationStatus === "verified" ? "default" : "outline",
											}))}
											value={currentOverrideIds}
										/>
									)}
								/>
							) : (
								<Controller
									control={createForm.control}
									name="overrideDestinationIds"
									render={({ field }) => (
										<PillSelector
											description={
												selectedRoutingMode === "override"
													? "Choose the inboxes that should receive this alias."
													: "Switch to Choose inboxes if this alias needs different recipients."
											}
											emptyText="Create at least one destination inbox first."
											label="Alias inboxes"
											onChange={field.onChange}
											options={destinations.map((destination) => ({
												description: destination.email,
												id: destination.id,
												label: destination.label,
												tone: destination.verificationStatus === "verified" ? "default" : "outline",
											}))}
											value={currentOverrideIds}
										/>
									)}
								/>
							)}
							{shouldShowMissingDefaultDestinations ? (
								<Alert variant="destructive">
									<AlertTitle>No default inboxes selected</AlertTitle>
									<AlertDescription>
										Add default inboxes to the domain or choose inboxes for this alias.
									</AlertDescription>
								</Alert>
							) : null}
							<Field orientation="horizontal">
								<FieldLabel>Active</FieldLabel>
								<FieldContent>
									{isEditing ? (
										<Controller
											control={updateForm.control}
											name="active"
											render={({ field }) => (
												<div className="flex items-center gap-3 rounded-2xl border border-border/80 bg-background/55 px-3 py-2">
													<Switch checked={field.value ?? true} onCheckedChange={field.onChange} />
													<div className="text-sm text-muted-foreground">
														Reject new mail while this alias is inactive.
													</div>
												</div>
											)}
										/>
									) : (
										<Controller
											control={createForm.control}
											name="active"
											render={({ field }) => (
												<div className="flex items-center gap-3 rounded-2xl border border-border/80 bg-background/55 px-3 py-2">
													<Switch checked={field.value ?? true} onCheckedChange={field.onChange} />
													<div className="text-sm text-muted-foreground">
														Reject new mail while this alias is inactive.
													</div>
												</div>
											)}
										/>
									)}
								</FieldContent>
							</Field>
						</FieldGroup>
					</div>
					<SheetFooter className="border-t border-border/70 bg-background/80">
						<ActionButton isWorking={isSubmitting} type="submit">
							{isEditing ? "Save alias" : "Create alias"}
						</ActionButton>
					</SheetFooter>
				</form>
			</SheetContent>
		</Sheet>
	);
}

export function DashboardPage() {
	const queryClient = useQueryClient();
	const [destinationSheetOpen, setDestinationSheetOpen] = useState(false);
	const [domainSheetOpen, setDomainSheetOpen] = useState(false);
	const [aliasSheetOpen, setAliasSheetOpen] = useState(false);
	const [editingAlias, setEditingAlias] = useState<Alias | null>(null);
	const [eventsSearch, setEventsSearch] = useState("");
	const deferredEventsSearch = useDeferredValue(eventsSearch);

	const domainsQuery = useQuery({
		queryFn: api.listDomains,
		queryKey: queryKeys.domains,
	});
	const destinationsQuery = useQuery({
		queryFn: api.listDestinations,
		queryKey: queryKeys.destinations,
	});
	const aliasesQuery = useQuery({
		queryFn: api.listAliases,
		queryKey: queryKeys.aliases,
	});
	const eventsQuery = useQuery({
		queryFn: api.listEvents,
		queryKey: queryKeys.events,
	});

	const domains = domainsQuery.data ?? [];
	const destinations = destinationsQuery.data ?? [];
	const aliases = aliasesQuery.data ?? [];
	const events = eventsQuery.data ?? [];
	const visibleEvents = events.filter((event) => {
		const needle = deferredEventsSearch.trim().toLowerCase();

		if (!needle) {
			return true;
		}

		return [event.recipientAddress, event.fromAddress, event.subject ?? ""]
			.join(" ")
			.toLowerCase()
			.includes(needle);
	});
	const destinationUsage = getDestinationUsage(domains, aliases);
	const firstError = [
		domainsQuery.error,
		destinationsQuery.error,
		aliasesQuery.error,
		eventsQuery.error,
	].find(Boolean);
	const activeAliasCount = aliases.filter((alias) => alias.active).length;
	const activeDomainCount = domains.filter((domain) => domain.status === "active").length;
	const verifiedDestinationCount = destinations.filter(
		(destination) => destination.verificationStatus === "verified",
	).length;
	const forwardedCount = events.filter((event) => event.status === "forwarded").length;

	async function invalidateDashboard() {
		await Promise.all([
			queryClient.invalidateQueries({ queryKey: queryKeys.domains }),
			queryClient.invalidateQueries({ queryKey: queryKeys.destinations }),
			queryClient.invalidateQueries({ queryKey: queryKeys.aliases }),
			queryClient.invalidateQueries({ queryKey: queryKeys.events }),
		]);
	}

	const createDestinationMutation = useMutation({
		mutationFn: api.createDestination,
		onError: (error) => {
			toast.error(error.message);
		},
		onSuccess: async () => {
			toast.success("Destination created.");
			setDestinationSheetOpen(false);
			await invalidateDashboard();
		},
	});
	const createDomainMutation = useMutation({
		mutationFn: api.createDomain,
		onError: (error) => {
			toast.error(error.message);
		},
		onSuccess: async () => {
			toast.success("Domain created.");
			setDomainSheetOpen(false);
			await invalidateDashboard();
		},
	});
	const createAliasMutation = useMutation({
		mutationFn: api.createAlias,
		onError: (error) => {
			toast.error(error.message);
		},
		onSuccess: async () => {
			toast.success("Alias created.");
			setAliasSheetOpen(false);
			await invalidateDashboard();
		},
	});
	const updateAliasMutation = useMutation({
		mutationFn: api.updateAlias,
		onError: (error) => {
			toast.error(error.message);
		},
		onSuccess: async () => {
			toast.success("Alias updated.");
			setAliasSheetOpen(false);
			setEditingAlias(null);
			await invalidateDashboard();
		},
	});
	const disableAliasMutation = useMutation({
		mutationFn: api.disableAlias,
		onError: (error) => {
			toast.error(error.message);
		},
		onSuccess: async () => {
			toast.success("Alias disabled.");
			await invalidateDashboard();
		},
	});
	const syncMutation = useMutation({
		mutationFn: api.syncCloudflare,
		onError: (error) => {
			toast.error(error.message);
		},
		onSuccess: async (result) => {
			toast.success(
				`Cloudflare sync complete for ${result.syncedDomains} domain${result.syncedDomains === 1 ? "" : "s"}.`,
			);
			await invalidateDashboard();
		},
	});

	const domainColumns: ColumnDef<Domain>[] = [
		{
			cell: ({ row }) => (
				<div className="min-w-56">
					<p className="font-medium text-foreground">{row.original.fqdn}</p>
					<p className="mt-1 text-xs text-muted-foreground">Zone {row.original.zoneId}</p>
				</div>
			),
			header: "Domain",
		},
		{
			cell: ({ row }) => (
				<Badge variant={getDomainStatusVariant(row.original.status)}>{row.original.status}</Badge>
			),
			header: "Status",
		},
		{
			cell: ({ row }) => (
				<div className="min-w-56">
					<InboxList items={row.original.defaultDestinations} />
				</div>
			),
			header: "Default inboxes",
		},
		{
			cell: ({ row }) => (
				<div className="text-sm text-muted-foreground">
					{formatRelativeTimestamp(row.original.updatedAt)}
				</div>
			),
			header: "Updated",
		},
	];
	const destinationColumns: ColumnDef<Destination>[] = [
		{
			cell: ({ row }) => (
				<div className="min-w-56">
					<p className="font-medium text-foreground">{row.original.label}</p>
					<p className="mt-1 text-xs text-muted-foreground">{row.original.email}</p>
				</div>
			),
			header: "Inbox",
		},
		{
			cell: ({ row }) => (
				<Badge variant={getDestinationVerificationVariant(row.original.verificationStatus)}>
					{row.original.verificationStatus}
				</Badge>
			),
			header: "Verification",
		},
		{
			cell: ({ row }) => {
				const usage = destinationUsage.get(row.original.id) ?? {
					defaultCount: 0,
					overrideCount: 0,
				};

				return (
					<div className="flex flex-wrap gap-1.5">
						<Badge variant="outline">Domain defaults {usage.defaultCount}</Badge>
						<Badge variant="outline">Alias choices {usage.overrideCount}</Badge>
					</div>
				);
			},
			header: "Usage",
		},
		{
			cell: ({ row }) => (
				<Badge variant={row.original.enabled ? "default" : "outline"}>
					{row.original.enabled ? "enabled" : "disabled"}
				</Badge>
			),
			header: "State",
		},
	];
	const aliasColumns: ColumnDef<Alias>[] = [
		{
			cell: ({ row }) => (
				<div className="min-w-64">
					<p className="font-medium text-foreground">
						{row.original.localPart}@{row.original.domainFqdn}
					</p>
					<p className="mt-1 text-xs text-muted-foreground">
						{row.original.label}
						{row.original.createdFor ? ` • ${row.original.createdFor}` : ""}
					</p>
				</div>
			),
			header: "Alias",
		},
		{
			cell: ({ row }) => (
				<div className="flex flex-col gap-2">
					<Badge variant={row.original.routingMode === "override" ? "default" : "outline"}>
						{row.original.routingMode === "override" ? "custom inboxes" : "domain inboxes"}
					</Badge>
					<InboxList items={row.original.effectiveDestinations} />
				</div>
			),
			header: "Inboxes",
		},
		{
			cell: ({ row }) => (
				<Badge variant={row.original.active ? "default" : "outline"}>
					{row.original.active ? "active" : "disabled"}
				</Badge>
			),
			header: "State",
		},
		{
			cell: ({ row }) => (
				<div className="text-sm text-muted-foreground">
					{formatRelativeTimestamp(row.original.updatedAt)}
				</div>
			),
			header: "Updated",
		},
		{
			cell: (cell) => (
				<AliasActionCell
					isBusy={disableAliasMutation.isPending || updateAliasMutation.isPending}
					onEdit={(alias) => {
						setEditingAlias(alias);
						setAliasSheetOpen(true);
					}}
					onQuickStateChange={(alias) => {
						if (alias.active) {
							void disableAliasMutation.mutateAsync(alias.id);
							return;
						}

						void updateAliasMutation.mutateAsync({
							id: alias.id,
							active: true,
						});
					}}
					row={cell.row}
				/>
			),
			header: "Actions",
		},
	];
	const eventColumns: ColumnDef<DeliveryEvent>[] = [
		{
			cell: ({ row }) => (
				<div className="min-w-44">
					<p className="font-medium text-foreground">
						{formatRelativeTimestamp(row.original.receivedAt)}
					</p>
					<p className="mt-1 text-xs text-muted-foreground">
						{formatTimestamp(row.original.receivedAt)}
					</p>
				</div>
			),
			header: "When",
		},
		{
			cell: ({ row }) => (
				<div className="min-w-64">
					<p className="font-medium text-foreground">{row.original.recipientAddress}</p>
					<p className="mt-1 text-xs text-muted-foreground">From {row.original.fromAddress}</p>
				</div>
			),
			header: "Message",
		},
		{
			cell: ({ row }) => (
				<div className="min-w-64 text-sm leading-6 text-muted-foreground">
					{row.original.subject ?? "No subject"}
					{row.original.subaddressTag ? (
						<div className="mt-1 text-xs uppercase tracking-[0.22em] text-primary">
							Plus tag {row.original.subaddressTag}
						</div>
					) : null}
				</div>
			),
			header: "Subject",
		},
		{
			cell: ({ row }) => (
				<div className="flex flex-col gap-2">
					<Badge variant={getDeliveryStatusVariant(row.original.status)}>
						{formatDeliveryStatus(row.original.status)}
					</Badge>
					<p className="text-xs text-muted-foreground">
						{row.original.attempts.length} delivery attempt
						{row.original.attempts.length === 1 ? "" : "s"}
					</p>
				</div>
			),
			header: "Outcome",
		},
	];

	return (
		<>
			<div className="relative min-h-screen overflow-hidden bg-background/72">
				<header className="sticky top-0 z-20 border-b border-border bg-background/96">
					<div className="flex h-14 items-center justify-between gap-4 px-4">
						<div className="flex items-center gap-3">
							<div className="flex size-8 items-center justify-center border border-primary bg-primary text-primary-foreground">
								<AtSignIcon />
							</div>
							<h1 className="font-mono text-sm font-semibold uppercase tracking-[0.2em] text-foreground">
								Mail Bin
							</h1>
						</div>
						<div className="flex flex-wrap items-center">
							<Button
								className="-ml-px border-border first:ml-0"
								onClick={() => {
									setEditingAlias(null);
									setAliasSheetOpen(true);
								}}
								size="sm"
								variant="default"
							>
								<MailPlusIcon data-icon="inline-start" />
								New alias
							</Button>
							<Button
								className="-ml-px border-border first:ml-0"
								onClick={() => setDestinationSheetOpen(true)}
								size="sm"
								variant="outline"
							>
								New inbox
							</Button>
							<ActionButton
								className="-ml-px border-border first:ml-0"
								isWorking={syncMutation.isPending}
								onClick={() => {
									void syncMutation.mutateAsync();
								}}
								size="sm"
								variant="outline"
							>
								Sync Cloudflare
							</ActionButton>
						</div>
					</div>
				</header>
				<main className="relative flex flex-col bg-background/72">
					<section className="grid gap-px bg-border sm:grid-cols-2 xl:grid-cols-4" id="overview">
						<StatCard icon={GlobeIcon} label="Domains" value={String(activeDomainCount)} />
						<StatCard
							icon={InboxIcon}
							label="Verified inboxes"
							value={String(verifiedDestinationCount)}
						/>
						<StatCard icon={TagsIcon} label="Active aliases" value={String(activeAliasCount)} />
						<StatCard icon={ForwardIcon} label="Delivered" value={String(forwardedCount)} />
					</section>

					{firstError ? (
						<Alert variant="destructive">
							<AlertTitle>Data load failed</AlertTitle>
							<AlertDescription>
								{firstError.message} If this is a new install, apply database migrations first and
								refresh.
							</AlertDescription>
						</Alert>
					) : null}

					<div className="grid items-stretch divide-y divide-border border-y border-border md:grid-cols-2 md:divide-x md:divide-y-0">
						<section className="flex min-w-0" id="domains">
							<DataTableCard
								columns={domainColumns}
								data={domains}
								description="Domains and subdomains available for aliases."
								emptyDescription="Add a domain to start."
								emptyIcon={GlobeIcon}
								emptyTitle="No domains"
								isLoading={domainsQuery.isPending}
								title="Domains"
								toolbar={
									<Button onClick={() => setDomainSheetOpen(true)} size="sm" variant="outline">
										Add domain
									</Button>
								}
							/>
						</section>

						<section className="flex min-w-0" id="destinations">
							<DataTableCard
								columns={destinationColumns}
								data={destinations}
								description="Primary inboxes that receive forwarded mail."
								emptyDescription="Add an inbox to receive mail."
								emptyIcon={InboxIcon}
								emptyTitle="No inboxes"
								isLoading={destinationsQuery.isPending}
								title="Inboxes"
								toolbar={
									<Button onClick={() => setDestinationSheetOpen(true)} size="sm" variant="outline">
										Add inbox
									</Button>
								}
							/>
						</section>
					</div>

					<section className="flex min-w-0 border-b border-border" id="aliases">
						<DataTableCard
							columns={aliasColumns}
							data={aliases}
							description="Disposable addresses and their forwarding rules."
							emptyDescription="Create an alias after adding a domain and inbox."
							emptyIcon={AtSignIcon}
							emptyTitle="No aliases"
							isLoading={aliasesQuery.isPending}
							title="Aliases"
							toolbar={
								<Button
									onClick={() => {
										setEditingAlias(null);
										setAliasSheetOpen(true);
									}}
									size="sm"
									variant="outline"
								>
									Create alias
								</Button>
							}
						/>
					</section>

					<section className="flex min-w-0" id="events">
						<DataTableCard
							columns={eventColumns}
							data={visibleEvents}
							description="Recent mail and delivery outcomes."
							emptyDescription={
								eventsSearch
									? "No events match the current filter."
									: "Events appear when mail arrives."
							}
							emptyIcon={HistoryIcon}
							emptyTitle={eventsSearch ? "No matching activity" : "No activity"}
							isLoading={eventsQuery.isPending}
							title="Activity"
							toolbar={
								<div className="w-full max-w-xs">
									<Input
										onChange={(event) => setEventsSearch(event.target.value)}
										placeholder="Filter activity"
										value={eventsSearch}
									/>
								</div>
							}
						/>
					</section>
				</main>
			</div>

			<DestinationSheet
				isSubmitting={createDestinationMutation.isPending}
				onOpenChange={setDestinationSheetOpen}
				onSubmit={async (values) => {
					await createDestinationMutation.mutateAsync(values);
				}}
				open={destinationSheetOpen}
			/>
			<DomainSheet
				destinations={destinations}
				isSubmitting={createDomainMutation.isPending}
				onOpenChange={setDomainSheetOpen}
				onSubmit={async (values) => {
					await createDomainMutation.mutateAsync(values);
				}}
				open={domainSheetOpen}
			/>
			<AliasSheet
				alias={editingAlias}
				destinations={destinations}
				domains={domains}
				isSubmitting={createAliasMutation.isPending || updateAliasMutation.isPending}
				onCreate={async (values) => {
					await createAliasMutation.mutateAsync(values);
				}}
				onOpenChange={(open) => {
					setAliasSheetOpen(open);
					if (!open) {
						setEditingAlias(null);
					}
				}}
				onUpdate={async (values) => {
					await updateAliasMutation.mutateAsync(values);
				}}
				open={aliasSheetOpen}
			/>
		</>
	);
}
