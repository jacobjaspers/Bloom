// Short, plain-English explanations shown by the ⓘ buttons.

export const HELP = {
  // Panels
  zones: 'Every part of your PC that lights up. Click one to give it its own settings, or use the switch to turn it on or off.',
  presets: 'Ready-made looks. Click one to apply it to all zones. Save your own from the Customize panel.',
  customize: 'Build the look yourself. Pick an effect, choose its colors, and tune how it moves.',
  hardware: 'The lighting controllers Lumen found and whether each is connected.',
  layout: 'Move and resize the fans, RAM, GPU, CPU and motherboard so this picture matches your PC. Drag a part to move it, drag its corner to resize, R rotates, Ctrl+Z undoes. Effects follow the new positions on your real lights.',
  ambient: 'Tints this window with the live colors of your lights, like a TV glowing on the wall behind it. Only affects the app, not your PC.',

  // Presets
  yours: 'Looks you saved. Hover a card to edit, duplicate, export or delete it. Edit opens it in Customize so you can rename it and change anything.',
  builtIn: 'Looks that come with Lumen. Hover a card and press ⧉ to copy it into your presets, then edit the copy.',

  // Stack editor
  layers: 'Effects stacked on top of each other. The bottom layer is the base; layers above it blend on top, e.g. sparkles over an aurora.',
  effect: 'The pattern this layer draws: a steady color, a moving wave, sparkles, fire and so on.',
  colors: 'The colors this effect uses. Each marker is a color; the effect blends between them. Click the bar to add one, drag to move, pull down to remove.',
  speed: 'How fast the effect moves.',
  reverse: 'Runs the motion the other way.',
  curve: 'How the effect changes over time: Smooth eases gently, Linear is steady, Pulse flashes briefly, Hard cuts instantly, Saw snaps on and fades out.',
  size: 'How big the pattern is: the length of a wave, a comet’s tail, or how many sparkles there are.',
  direction: 'Which way the effect travels across your case. Drag the dial or pick an arrow.',
  contrast: 'How much the brightness varies. Low keeps everything evenly lit; high gives deep darks between the bright parts.',
  brightnessRange: 'The dimmest and brightest this layer is allowed to get. Raise the left handle so it never goes fully dark.',
  hueDrift: 'Slowly sways all the colors around the color wheel, so the look shifts over time. 0° turns it off.',
  spread: 'At 0% the fans, RAM and GPU move in perfect sync. Higher values stagger each one so the effect ripples from part to part.',
  blend: 'How this layer mixes with the layers below. Normal covers them, Add and Screen brighten, Multiply tints and darkens.',
  opacity: 'How strongly this layer shows. Lower it to let the layers underneath come through.',

  // Zone inspector
  zoneBrightness: 'Brightness for this zone only, on top of the master brightness at the top of the window.',
  follow: 'On: this zone shows the same effect as everything else. Off: give it its own effect.',
  zonePreset: 'Copy a preset into this zone as a starting point, then adjust it.',
  ledsConnected: 'How many LEDs are plugged into this header. Wrong numbers can leave some LEDs dark or stretch the effect.',
  fansOnHeader: 'How many fans share this header, so the preview draws them correctly. Use 0 for an LED strip.',
  colorOrder: 'Some LEDs expect red, green and blue in a different order. If colors look wrong, try GRB.',
  identify: 'Runs a white light along this zone for a couple of seconds so you can see which part it is.',
} as const;
