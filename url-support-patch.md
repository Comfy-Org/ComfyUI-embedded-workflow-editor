# URL Support Patch

This patch adds URL parameter support to the ComfyUI Embedded Workflow Editor.

1. Step 1: Add the import for useSearchParams
```
import { useSearchParams } from "next/navigation";
```

2. Step 2: Add the searchParams hook and urlInput state:
```typescript
export default function Home() {
  const searchParams = useSearchParams();
  
  useManifestPWA({
    // existing code
  });

  const snap = useSnapshot(persistState);
  const snapSync = useSnapshot(persistState, { sync: true });
  const [workingDir, setWorkingDir] = useState<FileSystemDirectoryHandle>();
  const [urlInput, setUrlInput] = useState("");
```

3. Step 3: Add the effect to check for URL parameters and loadMediaFromUrl function:
```typescript
  useEffect(() => {
    const urlParam = searchParams.get('url');
    if (urlParam) {
      loadMediaFromUrl(urlParam);
    }
  }, [searchParams]);

  const loadMediaFromUrl = async (url: string) => {
    try {
      setUrlInput(url);
      toast.loading(`Loading file from URL: ${url}`);
      
      // Fetch the file from the URL
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to fetch file from URL: ${response.statusText}`);
      }
      
      // Get file type from content-type or fallback to extension
      const contentType = response.headers.get('content-type') || '';
      const extension = url.split('.').pop()?.toLowerCase() || '';
      
      // Check if the file type is supported
      const isSupported = ['png', 'webp', 'flac', 'mp4'].some(ext => 
        contentType.includes(ext) || extension === ext
      );
      
      if (!isSupported) {
        throw new Error(`Unsupported file format: ${contentType || extension}`);
      }
      
      // Convert the response to a blob
      const blob = await response.blob();
      
      // Create a File object from the blob
      const fileName = url.split('/').pop() || 'file';
      const file = new File([blob], fileName, { type: blob.type });
      
      // Process the file as if it was uploaded
      await gotFiles([file]);
      toast.dismiss();
      toast.success(`File loaded from URL: ${fileName}`);
    } catch (error) {
      toast.dismiss();
      toast.error(`Error loading file from URL: ${error instanceof Error ? error.message : String(error)}`);
      console.error('Error loading file from URL:', error);
    }
  };
```

4. Step 4: Add the URL input field in the UI:
```jsx
<div className="flex w-full gap-2">
  <input
    value={urlInput}
    onChange={(e) => setUrlInput(e.target.value)}
    className="input input-bordered input-sm flex-1"
    placeholder="Way-4. Paste URL here (png, webp, flac, mp4)"
  />
  <button
    className="btn btn-sm"
    onClick={() => {
      if (urlInput) {
        // Update the URL parameter
        const url = new URL(window.location.href);
        url.searchParams.set('url', urlInput);
        window.history.pushState({}, '', url);
        
        // Load the file from URL
        loadMediaFromUrl(urlInput);
      }
    }}
  >
    Load URL
  </button>
</div>
```

Add this right after the paste drop area and before the upload files button.
