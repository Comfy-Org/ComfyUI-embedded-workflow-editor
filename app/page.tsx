"use client";
import Editor, { useMonaco } from "@monaco-editor/react";
import clsx from "clsx";
import md5 from "md5";
import { motion } from "motion/react";
import { useEffect, useState } from "react";
import toast, { Toaster } from "react-hot-toast";
import sflow, { sf } from "sflow";
import useSWR from "swr";
import TimeAgo from "timeago-react";
import useManifestPWA from "use-manifest-pwa";
import { useSnapshot } from "valtio";
import { persistState } from "./persistState";
import { readWorkflowInfo } from "./utils/exif";
import { setPngMetadata } from "./utils/exif-png";
import { setWebpMetadata } from "./utils/exif-webp";

/**
 * @author snomiao <snomiao@gmail.com> 2024
 */
export default function Home() {
  useManifestPWA({
    icons: [
      {
        src: "/favicon.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/favicon.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
    name: "ComfyUI Embedded Workflow Editor",
    short_name: "CUI-EWE",
    start_url: "/",
  });

  const snap = useSnapshot(persistState);
  const snapSync = useSnapshot(persistState, { sync: true });
  const [workingDir, setWorkingDir] = useState<FileSystemDirectoryHandle>();

  useSWR(
    "/filelist",
    async () => workingDir && (await scanFilelist(workingDir)),
  );

  const monaco = useMonaco();
  const [editor, setEditor] = useState<any>();

  useEffect(() => {
    if (!monaco || !editor) return;
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, async () => {
      const savebtn = window.document.querySelector(
        "#save-workflow",
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

  const gotFiles = async (input: File[] | FileList) => {
    const files = input instanceof FileList ? fileListToArray(input) : input;
    if (!files.length) return;
    const readedWorkflowInfos = await sflow(files)
      .filter((e) => {
        if (e.name.match(".(png|flac|webp)$")) return true;
        toast.error("Not Supported format discarded: " + e.name);
        return null;
      })
      .map(
        async (e) =>
          await readWorkflowInfo(e).catch((err) => {
            toast.error(`FAIL to read ${e.name}\nCause:${String(err)}`);
            return null;
          }),
      )
      .filter() // filter empty
      .toArray();
    setWorkingDir(undefined);
    setTasklist(readedWorkflowInfos);
    chooseNthFileToEdit(readedWorkflowInfos, 0);
  };
  // when trying to enqueue, try ensure the output with same prefix with the input file
  return (
    <div
      className="flex flex-row gap-1 justify-center rounded-lg"
      onDragOver={(e) => {
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = "copy";
      }}
      onDrop={async (e) => {
        e.preventDefault();
        e.stopPropagation();
        await gotFiles(e.dataTransfer.files);
      }}
    >
      <div className="flex flex-col gap-4 config bg-dark shadow-lg p-4 w-[40em] max-h-screen rounded-lg">
        <h2 className="text-lg font-bold">
          ComfyUI Workflow Editor <i className="text-xs">in your browser</i>
        </h2>
        <div className="flex flex-col gap-1">
          <div className="">
            <label className="font-semibold">
              Import images by (only supports *.png,*.webp now):
            </label>
            &nbsp;
            <span>{workingDir ? "✅ Linked" : ""}</span>
          </div>
          <div className="gap-2 flex flex-col items-center">
            <input
              readOnly
              className="input input-bordered border-dashed input-sm w-full text-center"
              placeholder="Way-1. Paste/Drop images here"
              onPaste={async (e) => await gotFiles(e.clipboardData.files)}
            />
            <motion.button
              name="open-files"
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
                          "image/*": [".png", ".webp"],
                          "flac/*": [".flac"],
                        },
                      },
                    ],
                    excludeAcceptAllOption: true,
                    multiple: true,
                  });
                const files = await sf(filesHandles)
                  .map((e) => e.getFile())
                  .toArray();
                return gotFiles(files);
              }}
            >
              Way-2. Upload Files
            </motion.button>
            <button
              name="mount-folder"
              className="btn w-full"
              onClick={async () => {
                const workingDir =
                  // @ts-expect-error new api
                  (await window.showDirectoryPicker()) as unknown as FileSystemDirectoryHandle;
                setWorkingDir(workingDir);
                chooseNthFileToEdit(await scanFilelist(workingDir), 0);
              }}
            >
              Way-3. Mount a Folder
            </button>
            <i>* possibly choose /ComfyUI/output</i>
            {/* <div>* /ComfyUI/output</div> */}
          </div>
        </div>
        <br />
        <label className="font-semibold">Editable Workflows</label>
        <ul className={clsx("flex flex-col gap-1 overflow-auto")}>
          <fieldset>
            {!tasklist.length && (
              <div>
                Nothing editable yet, please import images with exif embedded
              </div>
            )}
            {tasklist.map((e, i) => {
              const id = md5(e.name);
              const editingTask = tasklist[snap.editing_index];
              return (
                <li
                  key={id}
                  className={clsx("p-1", {
                    "bg-slate-200": editingTask?.name === e.name,
                  })}
                  onClick={() => chooseNthFileToEdit(tasklist, i)}
                >
                  <input
                    id={id}
                    type="radio"
                    name="editing_workflow_json"
                    onClick={() => void chooseNthFileToEdit(tasklist, i)}
                    value={e.name}
                  />{" "}
                  <img
                    src={e.previewUrl}
                    className="w-[2em] h-[2em] inline object-cover"
                  />{" "}
                  <div className="inline-flex flex-col">
                    <label htmlFor={id}>{e.name}</label>
                    <div className="italic text-xs text-slate-500">
                      <TimeAgo
                        datetime={new Date(e.lastModified)}
                        title={new Date(e.lastModified).toISOString()}
                      />
                      {snap.editing_index === i ? " - Editing 🧪" : ""}
                    </div>
                  </div>
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
            value={snapSync.comfyapi}
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
              type="text"
              name="editing_filename"
              className="input input-bordered input-sm"
              value={snapSync.editing_filename}
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
              <span>
                {!workingDir
                  ? "(download)"
                  : snap.editing_filename === tasklist[snap.editing_index]?.name
                    ? "(overwrite)"
                    : "(save as)"}
              </span>
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
          className="w-[calc(100%-1px)] h-full"
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
      <Toaster />
    </div>
  );

  async function saveCurrentFile(modifiedMetadata: { workflow: string }) {
    const file = tasklist[persistState.editing_index].file;
    const filename = persistState.editing_filename || file.name;

    if (!file) return;
    const buffer = await file.arrayBuffer();
    const handlers: { [key: string]: () => Uint8Array } = {
      "image/png": () => setPngMetadata(buffer, modifiedMetadata),
      "image/webp": () => setWebpMetadata(buffer, modifiedMetadata),
      "audio/flac": () => {
        throw new Error("Not supported file type");
      },
    };

    const newBuffer = handlers[file.type]?.();
    if (!newBuffer) {
      const msg = "Not supported file type";
      alert(msg);
      throw new Error(msg);
    }

    const fileToSave = new File([newBuffer], filename, { type: file.type });
    if (workingDir) {
      await writeToWorkingDir(workingDir, fileToSave);
    } else {
      download(fileToSave);
    }
  }

  async function writeToWorkingDir(
    workingDir: FileSystemDirectoryHandle,
    file: File,
  ) {
    const h = await workingDir.getFileHandle(file.name, {
      create: true,
    });
    const w = await h.createWritable();
    await w.write(file);
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

function fileListToArray(files1: FileList) {
  return Array(files1.length)
    .fill(0)
    .map((_, i) => i)
    .map((i) => files1.item(i))
    .flatMap((e) => (e ? [e] : []));
}

function download(file: File) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(file);
  a.download = file.name;
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
  i: number,
) {
  if (!tasklist[i]) {
    persistState.editing_index = -1;
    return;
  }
  persistState.editing_index = i;
  persistState.editing_workflow_json = tryPrettyJson(tasklist[i].workflowJson!);
  persistState.editing_filename = tasklist[i].name!;
}
