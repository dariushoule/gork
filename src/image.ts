import { fal } from "@fal-ai/client";

fal.config({ credentials: process.env["FAL_KEY"] });

const ENDPOINT = "fal-ai/flux/schnell";

interface FluxSchnellOutput {
  images: Array<{ url: string; content_type: string }>;
}

interface FalPriceEntry {
  endpoint_id: string;
  unit_price: number;
  unit: string;
  currency: string;
}

interface FalPricingResponse {
  prices: FalPriceEntry[];
}

export async function fetchPricing(): Promise<FalPriceEntry | null> {
  const res = await fetch(
    `https://api.fal.ai/v1/models/pricing?endpoint_id=${ENDPOINT}`,
    { headers: { Authorization: `Key ${process.env["FAL_KEY"]}` } },
  );
  if (!res.ok) {
    console.warn(`fal pricing fetch failed: ${res.status}`);
    return null;
  }
  const data = (await res.json()) as FalPricingResponse;
  return data.prices[0] ?? null;
}

export async function generateImage(prompt: string): Promise<string> {
  const result = await fal.subscribe(ENDPOINT, {
    input: { prompt, image_size: "square", num_images: 1 },
  });

  const output = result.data as FluxSchnellOutput;
  const image = output.images[0];
  if (!image) throw new Error("No image returned");

  return image.url;
}
