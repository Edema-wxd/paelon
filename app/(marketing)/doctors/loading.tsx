import { RouteLoader } from "@/components/site/route-loader";

/** Covers the specialists index. */
export default function DoctorsLoading() {
  return (
    <RouteLoader
      label="Loading specialists"
      description="Bringing up our clinicians and their consulting times."
    />
  );
}
