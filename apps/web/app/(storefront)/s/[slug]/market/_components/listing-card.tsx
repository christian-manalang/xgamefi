import Link from "next/link";

type ListingCardProps = {
  listing: { id: string; itemId: string; price: { amount: string; currency: string } };
  slug: string;
};

export function ListingCard({ listing, slug }: ListingCardProps) {
  return (
    <Link href={`/s/${slug}/market/listing/${listing.id}`}>
      <div className="bg-surface-container-low border-2 border-outline-variant p-4 hover:border-primary-fixed">
        <p className="font-mono uppercase tracking-[0.1em] text-[12px] text-on-surface-variant">{listing.itemId}</p>
        <p className="font-display text-[24px] text-primary-fixed mt-2">
          {listing.price.amount} {listing.price.currency}
        </p>
      </div>
    </Link>
  );
}
