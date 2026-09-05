"use client";

import * as React from "react";
import { Download } from "lucide-react";
import type { OrderOutput } from "@/lib/data/types";
import { deliverableFilename, serializeDeliverable } from "@/lib/data/ext/gigs";
import { Button } from "@/components/ui/button";

/**
 * Save a run's deliverable to disk.
 *
 * Serialisation happens in the browser from the output already on the page —
 * a CSV run becomes a real `.csv`, a markdown run a `.md`, everything else
 * pretty-printed JSON — so there is no download endpoint to secure.
 */
export function DeliverableDownload({
  orderId,
  output,
}: {
  orderId: string;
  output: OrderOutput;
}) {
  const [saved, setSaved] = React.useState(false);
  const { extension } = serializeDeliverable(output);

  React.useEffect(() => {
    if (!saved) return;
    const timer = setTimeout(() => setSaved(false), 1800);
    return () => clearTimeout(timer);
  }, [saved]);

  function download() {
    const { text, mime } = serializeDeliverable(output);
    const blob = new Blob([text], { type: `${mime};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = deliverableFilename(orderId, extension);
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    setSaved(true);
  }

  return (
    <Button type="button" variant="outline" size="sm" onClick={download}>
      <Download className="size-3.5" aria-hidden="true" />
      {saved ? "Saved" : `Download .${extension}`}
    </Button>
  );
}
