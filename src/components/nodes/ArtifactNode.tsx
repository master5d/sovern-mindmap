import React, { useMemo } from 'react';
import { NodeProps } from 'reactflow';

export interface ArtifactNodeData {
  code: string;
}

export function ArtifactNode({ data }: NodeProps<ArtifactNodeData>) {
  const srcDoc = useMemo(() => {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="p-4 bg-white text-black min-h-screen">
  <div id="root"></div>
  <script crossorigin src="https://unpkg.com/react@18/umd/react.development.js"></script>
  <script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"></script>
  <script crossorigin src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
  <script type="text/babel" data-type="module">
    ${(data.code || 'const App = () => <div>No code provided</div>;').replace(/<\/script>/gi, '<\\/script>')}
    const root = ReactDOM.createRoot(document.getElementById('root'));
    root.render(React.createElement(App));
  </script>
</body>
</html>
    `;
  }, [data.code]);

  return (
    <div className="bg-surface-container rounded-xl shadow-lg border border-outline-variant overflow-hidden flex flex-col" style={{ width: 600, height: 400 }}>
      <div className="bg-surface-container-highest px-3 py-1 border-b border-outline-variant text-xs font-mono text-on-surface-variant flex items-center justify-between">
        <span>Artifact Preview</span>
      </div>
      <iframe 
        srcDoc={srcDoc} 
        className="flex-1 w-full h-full bg-white"
        sandbox="allow-scripts"
      />
    </div>
  );
}
