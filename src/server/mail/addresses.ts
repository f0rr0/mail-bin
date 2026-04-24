export function parseRecipientAddress(address: string) {
	const normalized = address.trim().toLowerCase();
	const atIndex = normalized.lastIndexOf("@");

	if (atIndex <= 0 || atIndex === normalized.length - 1) {
		throw new Error(`Invalid recipient address: ${address}`);
	}

	const localPart = normalized.slice(0, atIndex);
	const domain = normalized.slice(atIndex + 1);
	const plusIndex = localPart.indexOf("+");
	const baseLocalPart = plusIndex === -1 ? localPart : localPart.slice(0, plusIndex);
	const subaddressTag = plusIndex === -1 ? null : localPart.slice(plusIndex + 1) || null;

	return {
		baseLocalPart,
		domain,
		localPart,
		normalized,
		subaddressTag,
	};
}
