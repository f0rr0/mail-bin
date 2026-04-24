import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { Toaster } from "sonner";

import { TooltipProvider } from "@/components/ui/tooltip";
import { router } from "@/client/router";

const queryClient = new QueryClient({
	defaultOptions: {
		queries: {
			refetchOnWindowFocus: false,
			staleTime: 30_000,
		},
	},
});

export function App() {
	return (
		<TooltipProvider>
			<QueryClientProvider client={queryClient}>
				<RouterProvider router={router} />
				<Toaster closeButton position="top-right" richColors theme="light" />
			</QueryClientProvider>
		</TooltipProvider>
	);
}
