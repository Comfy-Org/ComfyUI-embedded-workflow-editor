# ComfyUI embedded workflow editor

In-place embedded workflow-exif editing experience for ComfyUI generated images. Edit png exif just in your browser.

![screenshot](docs/screenshot.png)

## Usage

1. Open https://comfyui-embeded-workflow-editor.vercel.app/
2. Upload your img (or mount your local directory)
3. Edit as you want
4. Save!

## Roadmap

- [x] Support for more image formats (png, jpg, webp, etc)
  - [x] png read/write
  - [x] webp read/write
  - [ ] jpg (seems not possible yet)
- [x] Show preview img to ensure you are editing the right image (thumbnail)
- [ ] Support for other exif tags ("prompt", ...)
- [ ] maybe provide cli tool, [create issue to request this function](https://github.com/Comfy-Org/ComfyUI-embedded-workflow-editor/issues/new)
  - `comfy-meta get --key=workflow img.webp > workflow.json`
  - `comfy-meta set img.webp --key=workflow --value=workflow.json`

## Contributing

Requirements: - [Bun — A fast all-in-one JavaScript runtime](https://bun.sh/)

Run the following commands start your development:

```
git clone https://github.com/snomiao/ComfyUI-embeded-workflow-editor
cd
bun install
bun dev
```

## About

@snomiao 2024

## License

MIT
