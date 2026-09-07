import { RouteLoader } from "@/components/site/route-loader";

/** Covers the blog index and every article. Articles parse Markdown on the
 *  server, so this is the boundary most likely to actually be seen. */
export default function BlogLoading() {
  return (
    <RouteLoader
      label="Loading article"
      description="Fetching the latest from Paelon Memorial Hospital."
    />
  );
}
