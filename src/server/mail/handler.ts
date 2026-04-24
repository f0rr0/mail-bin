import type { AppBindings } from "@/server/app-env";
import {
	addDeliveryAttempt,
	findAliasRoutingSnapshot,
	recordDeliveryEvent,
	updateDeliveryEventStatus,
} from "@/server/data/service";
import { getDb } from "@/server/db";

interface ParsedEmail {
	subject: string | null;
	messageId: string | null;
}

function parseEmailMetadata(message: ForwardableEmailMessage): ParsedEmail {
	return {
		messageId: message.headers.get("message-id"),
		subject: message.headers.get("subject"),
	};
}

export async function handleIncomingEmail(message: ForwardableEmailMessage, env: AppBindings) {
	const db = getDb(env);
	const { parseRecipientAddress } = await import("@/server/mail/addresses");
	const recipient = parseRecipientAddress(message.to);
	const metadata = parseEmailMetadata(message);

	try {
		const match = await findAliasRoutingSnapshot(db, {
			baseLocalPart: recipient.baseLocalPart,
			domain: recipient.domain,
			localPart: recipient.localPart,
			subaddressTag: recipient.subaddressTag,
		});

		if (!match.domain) {
			message.setReject("Unknown routed domain.");
			await recordDeliveryEvent(db, {
				errorCode: "unknown_domain",
				fromAddress: message.from.toLowerCase(),
				localPart: recipient.localPart,
				messageId: metadata.messageId,
				recipientAddress: recipient.normalized,
				status: "rejected_unknown_domain",
				subaddressTag: recipient.subaddressTag,
				subject: metadata.subject,
			});
			return;
		}

		if (!match.alias) {
			message.setReject("Alias not found.");
			await recordDeliveryEvent(db, {
				domainId: match.domain.id,
				errorCode: "unknown_alias",
				fromAddress: message.from.toLowerCase(),
				localPart: recipient.localPart,
				messageId: metadata.messageId,
				recipientAddress: recipient.normalized,
				status: "rejected_unknown_alias",
				subaddressTag: recipient.subaddressTag,
				subject: metadata.subject,
			});
			return;
		}

		if (!match.alias.active) {
			message.setReject("Alias is disabled.");
			await recordDeliveryEvent(db, {
				aliasId: match.alias.id,
				domainId: match.domain.id,
				errorCode: "alias_disabled",
				fromAddress: message.from.toLowerCase(),
				localPart: recipient.localPart,
				messageId: metadata.messageId,
				recipientAddress: recipient.normalized,
				resolvedLocalPart: match.resolvedLocalPart,
				status: "rejected_disabled_alias",
				subaddressTag: recipient.subaddressTag,
				subject: metadata.subject,
			});
			return;
		}

		if (match.destinations.length === 0) {
			message.setReject("Alias has no active destinations.");
			await recordDeliveryEvent(db, {
				aliasId: match.alias.id,
				domainId: match.domain.id,
				errorCode: "no_destinations",
				fromAddress: message.from.toLowerCase(),
				localPart: recipient.localPart,
				messageId: metadata.messageId,
				recipientAddress: recipient.normalized,
				resolvedLocalPart: match.resolvedLocalPart,
				status: "rejected_no_destinations",
				subaddressTag: recipient.subaddressTag,
				subject: metadata.subject,
			});
			return;
		}

		const eventId = await recordDeliveryEvent(db, {
			aliasId: match.alias.id,
			domainId: match.domain.id,
			fromAddress: message.from.toLowerCase(),
			localPart: recipient.localPart,
			messageId: metadata.messageId,
			recipientAddress: recipient.normalized,
			resolvedLocalPart: match.resolvedLocalPart,
			status: "forwarded",
			subaddressTag: recipient.subaddressTag,
			subject: metadata.subject,
		});

		let failedForAnyDestination = false;

		for (const destination of match.destinations) {
			try {
				await message.forward(destination.email);
				await addDeliveryAttempt(db, {
					destinationEmail: destination.email,
					destinationId: destination.id,
					eventId,
					status: "forwarded",
				});
			} catch (error) {
				failedForAnyDestination = true;
				await addDeliveryAttempt(db, {
					destinationEmail: destination.email,
					destinationId: destination.id,
					errorCode: error instanceof Error ? error.message : "forward_failed",
					eventId,
					status: "failed",
				});
			}
		}

		if (failedForAnyDestination) {
			await updateDeliveryEventStatus(
				db,
				eventId,
				"partial_failure",
				"one_or_more_forwards_failed",
			);
		}
	} catch (error) {
		message.setReject("Mail Bin could not process the email.");
		await recordDeliveryEvent(db, {
			errorCode: error instanceof Error ? error.message : "processing_error",
			fromAddress: message.from.toLowerCase(),
			localPart: recipient.localPart,
			messageId: metadata.messageId,
			recipientAddress: recipient.normalized,
			status: "processing_error",
			subaddressTag: recipient.subaddressTag,
			subject: metadata.subject,
		});
	}
}
