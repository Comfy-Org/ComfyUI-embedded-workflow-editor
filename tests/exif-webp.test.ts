import { getWebpMetadata, setWebpMetadata } from "@/app/utils/exif";
import { glob } from "glob";

it("extract webp workflow", async () => {
  const files = await glob("./tests/*.webp");
  expect(files.length).toBeGreaterThanOrEqual(1);

  for await (const filename of files) {
    const webp = Bun.file(filename);
    const ref = Bun.file(webp.name + ".workflow.json");

    const exif = getWebpMetadata(await webp.arrayBuffer());

    const workflow_expect = JSON.stringify(JSON.parse(exif.workflow));
    const workflow_actual = JSON.stringify(JSON.parse(await ref.text()));
    expect(workflow_expect).toEqual(workflow_actual);
  }
});

it("set webp workflow", async () => {
  const files = await glob("./tests/*.webp");
  expect(files.length).toBeGreaterThanOrEqual(1);

  for await (const filename of files) {
    const webp = Bun.file(filename);

    const newWorkflow = '{"test":"hello, snomiao"}';
    const buffer2 = setWebpMetadata(await webp.arrayBuffer(), {
      workflow: newWorkflow,
    });
    const file2 = new File([buffer2], webp.name!);

    const workflow_actual = JSON.stringify(
      JSON.parse(getWebpMetadata(await file2.arrayBuffer()).workflow)
    );
    const workflow_expect = JSON.stringify(JSON.parse(newWorkflow));
    expect(workflow_expect).toEqual(workflow_actual);
  }
});
