"use client";
import Editor, { useMonaco } from "@monaco-editor/react";
import clsx from "clsx";
import md5 from "md5";
import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { rangeFlow, sf } from "sflow";
import useSWR from "swr";
import TimeAgo from "timeago-react";
import { useSnapshot } from "valtio";
import { persistState } from "./persistState";
import { readWorkflowInfo, setToPngBuffer } from "./utils/exif";

/**
 * @author snomiao <snomiao@gmail.com> 2024
 */
export default function Home() {
  const snap = useSnapshot(persistState);
  const [workingDir, setWorkingDir] = useState<FileSystemDirectoryHandle>();
  useSWR(
    "/filelist",
    async () => workingDir && (await scanFilelist(workingDir))
  );

  const monaco = useMonaco();
  const [editor, setEditor] = useState<any>();

  useEffect(() => {
    if (!monaco || !editor) return;
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, async () => {
      const savebtn = window.document.querySelector(
        "#save-workflow"
      ) as HTMLButtonElement;
      savebtn?.click();
      // editor.getAction("editor.action.formatDocument")!.run();

      // assume editing_workflow_json is latest

      // const workflow = tryMinifyJson(persistState.editing_workflow_json);
      // const modifiedMetadata = { workflow };
      // await saveCurrentFile(tasklist, modifiedMetadata);
    });
  }, [monaco, editor]);

  const [tasklist, setTasklist] = useState<
    Awaited<ReturnType<typeof readWorkflowInfo>>[]
  >([]);

  // when trying to enqueue, try ensure the output with same prefix with the input file
  return (
    <div className="flex flex-row gap-1 justify-center rounded-lg">
      <div className="flex flex-col gap-4 config bg-dark shadow-lg p-4 w-[40em] max-h-screen rounded-lg">
        <h2 className="text-lg font-bold">
          ComfyUI Workflow Editor <i className="text-xs">in your browser</i>
        </h2>
        <div className="flex flex-col gap-1">
          <div className="">
            <label className="font-semibold">
              Input images by (only supports *.png now):
            </label>
            &nbsp;
            <span>{workingDir ? "✅ Linked" : ""}</span>
          </div>
          <div className="gap-2 flex flex-col items-center">
            <input
              readOnly
              className="input input-bordered border-dashed input-sm w-full text-center"
              placeholder="Way-1. Paste/Drop images here"
              onPaste={async (e) => {
                const files = e.clipboardData.files;
                if (!files.length) return;
                const readedWorkflowInfos = await rangeFlow(0, files.length)
                  .map((i) => files.item(i))
                  .filter((e) => e?.name.match(".(png|flac|webp)$"))
                  .filter()
                  .map(async (e) => await readWorkflowInfo(e))
                  .toArray();
                setTasklist(readedWorkflowInfos);
                chooseNthFileToEdit(readedWorkflowInfos, 0);
              }}
              onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
                e.dataTransfer.dropEffect = "copy";
              }}
              onDrop={async (e) => {
                e.preventDefault();
                e.stopPropagation();
                const files = e.dataTransfer.files;
                if (!files.length) return;
                const readedWorkflowInfos = await rangeFlow(0, files.length)
                  .map((i) => files.item(i))
                  .filter((e) => e?.name.match(".(png|flac|webp)$"))
                  .filter()
                  .map(async (e) => await readWorkflowInfo(e))
                  .toArray();
                setTasklist(readedWorkflowInfos);
                chooseNthFileToEdit(readedWorkflowInfos, 0);
              }}
            />
            <motion.button
              name="open-output-folder"
              className="btn w-full"
              animate={{}}
              onClick={async () => {
                const filesHandles: FileSystemFileHandle[] =
                  // @ts-expect-error new api
                  await window.showOpenFilePicker({
                    types: [
                      {
                        description: "Images",
                        accept: {
                          "image/*": [".png", ".gif", ".jpeg", ".jpg"],
                        },
                      },
                    ],
                    excludeAcceptAllOption: true,
                    multiple: true,
                  });
                const readedWorkflowInfos = await sf(filesHandles)
                  .map((e) => e.getFile())
                  .map(async (e) => await readWorkflowInfo(e))
                  .filter((e) => e.workflowJson)
                  .toArray();
                setTasklist(readedWorkflowInfos);
                setWorkingDir(undefined);
                chooseNthFileToEdit(readedWorkflowInfos, 0);
              }}
            >
              Way-2. Upload Files (download on save)
            </motion.button>
            <button
              name="open-output-folder"
              className="btn w-full"
              onClick={async () => {
                const workingDir =
                  // @ts-expect-error new api
                  (await window.showDirectoryPicker()) as unknown as FileSystemDirectoryHandle;
                setWorkingDir(workingDir);
                chooseNthFileToEdit(await scanFilelist(workingDir), 0);
              }}
            >
              Way-3. Choose Working Folder (overwrite on save)
            </button>
            <i>* possibly choose /ComfyUI/output</i>
            {/* <div>* /ComfyUI/output</div> */}
          </div>
        </div>
        <br />
        <label className="font-semibold">Editable Workflows</label>
        <ul className={clsx("flex flex-col gap-1 overflow-auto")}>
          <fieldset>
            {!tasklist.length && <div>Nothing editable yet</div>}
            {tasklist.map((e, i) => {
              const id = md5(e.name);
              const editingTask = tasklist[snap.editing_index];
              return (
                <li
                  key={id}
                  className={clsx({
                    "bg-slate-200": editingTask?.name === e.name,
                  })}
                >
                  <input
                    id={id}
                    type="radio"
                    name="editing_workflow_json"
                    onClick={async () => {
                      chooseNthFileToEdit(tasklist, i);
                    }}
                    value={e.name}
                  />{" "}
                  <img
                    src={e.previewUrl}
                    className="w-[2em] h-[2em] inline object-cover"
                  />{" "}
                  <label htmlFor={id}>
                    {e.name} -{" "}
                    <TimeAgo
                      datetime={new Date(e.lastModified)}
                      title={new Date(e.lastModified).toISOString()}
                    />
                  </label>
                  {snap.editing_index === i ? " Editing 🧪" : ""}
                </li>
              );
            })}
          </fieldset>
        </ul>
        {/* <div>
          <label className="font-semibold" htmlFor="editingImage">
            Choose Editing Image
          </label>
          {snap.working_folder_name}
          <input
            name="editingImage"
            className="input input-bordered input-sm"
            value={snap.editing_img_filename ?? ""}
            onChange={(e) => void (state.editing_img_filename = e.target.value)}
          />
          <datalist></datalist>
        </div> */}
        {/* <div className="flex flex-col gap-1">
          <label className="font-semibold" htmlFor="imgprefix">
            Output Image Prefix
          </label>
          <input
            name="imgprefix"
            value={snap.imgprefix}
            onChange={(e) => void (state.imgprefix = e.target.value)}
          />
        </div> */}
        <div className={clsx("flex flex-col gap-1 hidden")}>
          <label className="font-semibold" htmlFor="comfyapi">
            ComfyUI Server
          </label>
          <input
            name="comfyapi"
            value={snap.comfyapi}
            onChange={(e) => void (persistState.comfyapi = e.target.value)}
          />
          <div>
            {snap.connected ? "Connected" : snap.connecting ? "Connecting" : ""}
          </div>
        </div>
      </div>
      <div
        className={clsx("w-full h-screen flex flex-col gap-1 ", {
          hidden: !tasklist[snap.editing_index],
        })}
      >
        <div className="flex flex-row items-center gap-4 p-2">
          <div className="flex flex-col gap-1"></div>
          <img
            src={tasklist[snap.editing_index]?.previewUrl ?? ""}
            className="h-[3em] w-[3em] inline object-contain rounded"
            alt="Preview Editing Image"
          />
          <div>
            <input
              className="input input-bordered input-sm"
              value={snap.editing_filename}
              onChange={(e) =>
                void (persistState.editing_filename = e.target.value)
              }
            />
          </div>

          <div>
            <button
              disabled={
                tryMinifyJson(snap.editing_workflow_json ?? "") ===
                tryMinifyJson(tasklist[snap.editing_index]?.workflowJson ?? "")
              }
              className="btn btn-primary"
              id="save-workflow"
              onClick={async () => {
                const workflow = tryMinifyJson(snap.editing_workflow_json);
                const modifiedMetadata = { workflow };
                await saveCurrentFile(modifiedMetadata);
              }}
            >
              Save exif into image{" "}
              <span>{workingDir ? "(overwrite)" : "(download)"}</span>
            </button>
          </div>

          {/* <div>
            <input
              type="checkbox"
              name="autosave"
              checked={snap.autosave}
              onChange={(e) => (persistState.autosave = e.target.checked)}
              id="autosave"
            />
            <label htmlFor="autosave">Auto Save</label>
          </div> */}
        </div>
        <Editor
          language="json"
          value={snap.editing_workflow_json ?? "{}"}
          onChange={(e) => {
            const content = e ?? "";
            persistState.editing_workflow_json = content;
            if (
              snap.autosave &&
              content !== tasklist[snap.editing_index].workflowJson
            ) {
              saveCurrentFile({ workflow: tryMinifyJson(content) });
            }
          }}
          className="w-full h-full"
          onValidate={(e) => console.log(e)}
          onMount={(editor) => setEditor(editor)}
        />
      </div>
      <span id="forkongithub">
        <a
          href="https://github.com/snomiao/ComfyUI-embeded-workflow-editor"
          target="_blank"
        >
          Fork me on GitHub
        </a>
      </span>
    </div>
  );

  async function saveCurrentFile(modifiedMetadata: { workflow: string }) {
    const file = tasklist[persistState.editing_index].file;
    const filename = persistState.editing_filename;
    if (!file) return;
    const png = setToPngBuffer(await file.arrayBuffer(), modifiedMetadata);

    if (!workingDir) {
      const f = new File([png], filename, {
        type: file.type,
      });
      download(f);
    } else {
      // save to image (overwrite when we have workingDir permission)
      await writeBack(workingDir, filename, png);
    }
  }

  async function writeBack(
    workingDir: FileSystemDirectoryHandle,
    filename: string,
    newBuffer: Uint8Array
  ) {
    const h = await workingDir.getFileHandle(filename, {
      create: true,
    });
    const w = await h.createWritable();
    await w.write(newBuffer);
    await w.close();
    await scanFilelist(workingDir);
  }

  async function scanFilelist(workingDir: FileSystemDirectoryHandle) {
    // @ts-expect-error new api
    const aIter = workingDir.values() as AsyncIterable<FileSystemFileHandle>;
    const readed = await sf(aIter)
      .filter((e) => e.kind === "file")
      .filter((e) => e.name.match(".(png|flac|webp)$"))
      .map(async (e) => await e.getFile())
      .map(async (e) => await readWorkflowInfo(e))
      .filter((e) => e.workflowJson)
      .toArray();
    setTasklist(readed);
    if (snap.editing_index === -1) chooseNthFileToEdit(readed, 0);
    return readed;
  }
}

function download(newFile: File) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(newFile);
  a.download = newFile.name;
  a.click();
}

function tryMinifyJson(json: string) {
  try {
    return JSON.stringify(JSON.parse(json));
  } catch (_: unknown) {
    return json;
  }
}
function tryPrettyJson(json: string) {
  try {
    return JSON.stringify(JSON.parse(json), null, 2);
  } catch (_: unknown) {
    return json;
  }
}

function chooseNthFileToEdit(
  tasklist: Awaited<ReturnType<typeof readWorkflowInfo>>[],
  i: number
) {
  if (!tasklist[i]) {
    persistState.editing_index = -1;
    return;
  }
  persistState.editing_index = i;
  persistState.editing_workflow_json = tryPrettyJson(tasklist[i].workflowJson!);
  persistState.editing_filename = tasklist[i].name!;
}
