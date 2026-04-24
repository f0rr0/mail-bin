import { lazy, Suspense } from "react";
import { createRootRoute, createRoute, createRouter, Outlet } from "@tanstack/react-router";

import { Skeleton } from "@/components/ui/skeleton";

const DashboardPage = lazy(async () => {
	const module = await import("@/client/dashboard");

	return {
		default: module.DashboardPage,
	};
});

function RootLayout() {
	return <Outlet />;
}

function MetricSkeleton() {
	return (
		<section className="flex min-h-30 items-center justify-between bg-card/90 p-3">
			<div>
				<Skeleton className="h-3 w-24" />
				<Skeleton className="mt-3 h-6 w-8" />
			</div>
			<Skeleton className="size-10 border border-border bg-muted/45" />
		</section>
	);
}

function PanelSkeleton({ wide = false }: { wide?: boolean }) {
	return (
		<section className="min-w-0 bg-card/90">
			<header className="flex min-h-20 items-start justify-between border-b border-border/70 p-3">
				<div>
					<Skeleton className="h-5 w-24" />
					<Skeleton className="mt-2 h-3 w-64 max-w-[56vw]" />
					<Skeleton className="mt-2 h-3 w-40 max-w-[42vw]" />
				</div>
				<Skeleton className="h-7 w-24 border border-border" />
			</header>
			<div
				className={
					wide
						? "flex min-h-44 items-center justify-center"
						: "flex min-h-36 items-center justify-center"
				}
			>
				<div className="flex flex-col items-center gap-3">
					<Skeleton className="size-8 border border-border bg-muted/45" />
					<Skeleton className="h-3 w-24" />
					<Skeleton className="h-3 w-44 opacity-60" />
				</div>
			</div>
		</section>
	);
}

function DashboardSkeleton() {
	return (
		<main className="min-h-screen bg-background text-foreground">
			<section className="min-w-0">
				<header className="flex h-14 items-center justify-between border-b border-border bg-background/96 px-4">
					<div className="flex items-center gap-3">
						<Skeleton className="size-8 border border-primary bg-primary" />
						<Skeleton className="h-3 w-32" />
					</div>
					<div className="hidden items-center sm:flex">
						<Skeleton className="h-7 w-24 border border-border" />
						<Skeleton className="-ml-px h-7 w-24 border border-border" />
						<Skeleton className="-ml-px h-7 w-28 border border-border" />
					</div>
				</header>
				<div className="grid gap-px bg-border">
					<section className="grid gap-px bg-border sm:grid-cols-2 xl:grid-cols-4">
						<MetricSkeleton />
						<MetricSkeleton />
						<MetricSkeleton />
						<MetricSkeleton />
					</section>
					<section className="grid gap-px bg-border md:grid-cols-2">
						<PanelSkeleton />
						<PanelSkeleton />
					</section>
					<PanelSkeleton wide />
				</div>
			</section>
		</main>
	);
}

function DashboardRoute() {
	return (
		<Suspense fallback={<DashboardSkeleton />}>
			<DashboardPage />
		</Suspense>
	);
}

const rootRoute = createRootRoute({
	component: RootLayout,
});

const indexRoute = createRoute({
	component: DashboardRoute,
	getParentRoute: () => rootRoute,
	path: "/",
});

const routeTree = rootRoute.addChildren([indexRoute]);

export const router = createRouter({
	defaultPreload: "intent",
	routeTree,
	scrollRestoration: true,
});

declare module "@tanstack/react-router" {
	interface Register {
		router: typeof router;
	}
}
