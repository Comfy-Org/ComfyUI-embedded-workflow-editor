import { getPngMetadata, setPngMetadata } from "@/app/utils/exif";
import { glob } from "glob";

it("extract png workflow", async () => {
  const pngs = await glob("./tests/ComfyUI_*.png");
  expect(pngs.length).toBeGreaterThanOrEqual(1);

  for await (const filename of pngs) {
    const png = Bun.file(filename);
    const ref = Bun.file(png.name + ".workflow.json");

    const exif = getPngMetadata(await png.arrayBuffer());

    const workflow_expect = JSON.stringify(JSON.parse(exif.workflow));
    const workflow_actual = JSON.stringify(JSON.parse(await ref.text()));
    expect(workflow_expect).toEqual(workflow_actual);
  }
});

it("set png workflow", async () => {
  const pngs = await glob("./tests/ComfyUI_*.png");
  expect(pngs.length).toBeGreaterThanOrEqual(1);

  for await (const filename of pngs) {
    const png = Bun.file(filename);

    const newWorkflow = '{"test":"hello, snomiao"}';
    const buffer2 = setPngMetadata(await png.arrayBuffer(), {
      workflow: newWorkflow,
    });
    const file2 = new File([buffer2], png.name!);

    const workflow_actual = JSON.stringify(
      JSON.parse(getPngMetadata(await file2.arrayBuffer()).workflow)
    );
    const workflow_expect = JSON.stringify(JSON.parse(newWorkflow));
    expect(workflow_expect).toEqual(workflow_actual);
  }
});

it("extract blank png workflow", async () => {
  const pngs = await glob("./tests/Blank_*.png");
  expect(pngs.length).toBeGreaterThanOrEqual(1);

  for await (const filename of pngs) {
    const png = Bun.file(filename);
    const exif = getPngMetadata(await png.arrayBuffer());
    expect(exif.workflow).toBe(undefined);
  }
});

it("set blank png workflow", async () => {
  const pngs = await glob("./tests/Blank_*.png");
  expect(pngs.length).toBeGreaterThanOrEqual(1);

  for await (const filename of pngs) {
    const png = Bun.file(filename);

    const newWorkflow = '{"test":"hello, snomiao"}';
    const buffer2 = setPngMetadata(await png.arrayBuffer(), {
      workflow: newWorkflow,
    });
    const file2 = new File([buffer2], png.name!);

    const exif2 = getPngMetadata(await file2.arrayBuffer());
    const workflow_actual = JSON.stringify(JSON.parse(exif2.workflow));
    const workflow_expect = JSON.stringify(JSON.parse(newWorkflow));
    expect(workflow_expect).toEqual(workflow_actual);
  }
});
