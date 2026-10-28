# V4 style specification — every prompt must follow this

One coherent game, not a collection of unrelated AI images.

- Perspective: isometric, same camera angle for every asset, ground
  contact at the bottom centre of the sprite. No top-down, no side-view
  mixed with isometric, no photorealism mixed with pixel art.
- Pixel density: chunky, readable pixels; sharp pixel edges; flat
  colours; no gradients, no smooth shading, no blur.
- Palette: warm building colours, natural greens, dark asphalt,
  restrained accents. Same palette family across buildings, trees,
  vehicles, and characters.
- Light: one light direction for the whole town (top-left), consistent
  shadows under every object, ambient-occlusion-style darkening at
  wall/floor joins.
- Silhouettes: readable at 120-160 px display width (buildings) and
  24x32 px (characters). No malformed doors, no distorted windows,
  no fake signage text, no random text anywhere.
- Backgrounds: plain solid background for generation, removed only by
  a validated method (see README). Never bake ground tiles into a
  building sprite — ground tiles are separate assets.
- Characters: same identity across directions is verified, never
  assumed. If a sheet mixes identities, reject it and generate
  individual poses.

Negative prompt (all assets):
blurry, realistic, photorealistic, 3d render, gradient, smooth shading,
watermark, text, logo, distorted windows, malformed doors, extra limbs,
low quality, noisy texture
