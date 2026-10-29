# Extension icon

`icon.png` is the original image, including its embedded provenance metadata.
Keep it unchanged. `marketplace.png` is the lossless distribution copy used by
the extension manifest. It omits metadata to fit Marketplace's 1 MiB limit.
Both images decode to identical 1024 × 1024 RGBA pixels.

To recreate the distribution copy with ImageMagick:

```sh
magick icons/icon.png -strip -define png:compression-level=9 icons/marketplace.png
```

Run `node --test test/node/product-surface.test.js` to check the packaged icon's
format, minimum dimensions and size. The original image and this document are
excluded from the VSIX.
