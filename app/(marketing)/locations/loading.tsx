import { RouteLoader } from "@/components/site/route-loader";

/** Covers the branch index and each branch page. */
export default function LocationsLoading() {
  return (
    <RouteLoader
      label="Loading branches"
      description="Bringing up addresses, hours and directions."
    />
  );
}
