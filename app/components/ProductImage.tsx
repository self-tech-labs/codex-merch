import {Image} from '@shopify/hydrogen';
import type {ComponentProps} from 'react';

type ProductImageData = ComponentProps<typeof Image>['data'] | null | undefined;

export function ProductImage({
  image,
}: {
  image: ProductImageData;
}) {
  if (!image) {
    return <div className="product-image" />;
  }
  return (
    <div className="product-image">
      <Image
        alt={image.altText || 'Product Image'}
        aspectRatio="1/1"
        data={image}
        key={image.id}
        sizes="(min-width: 45em) 50vw, 100vw"
      />
    </div>
  );
}
