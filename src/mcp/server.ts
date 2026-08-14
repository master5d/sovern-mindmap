import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { appendArtifact, readDecisions } from "./artifactInbox.js";
import {
  CanvasFileStore,
  resolveBoardPath,
  createCanvasNode,
  updateCanvasNode,
  readCanvasBranch,
  calculateCanvasRollup,
} from "./canvasFileStore.js";

// Файловый бэкенд: тот же board.canvas, который поллит UI (env SOVERN_BOARD,
// дефолт совпадает с vite.config.ts). Каждый инструмент перечитывает файл,
// мутации пишутся атомарно — см. canvasFileStore.ts.
const store = new CanvasFileStore(resolveBoardPath());

const server = new Server(
  {
    name: "sovern-mindmap-server",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "read_graph",
        description: "Get the full SOVERN mindmap in JSON Canvas format",
        inputSchema: { type: "object", properties: {} },
      },
      {
        name: "read_branch",
        description: "Get a specific subtree of the graph",
        inputSchema: {
          type: "object",
          properties: {
            node_id: { type: "string", description: "Root node ID of the branch" },
          },
          required: ["node_id"],
        },
      },
      {
        name: "create_node",
        description: "Add a new node to the mindmap",
        inputSchema: {
          type: "object",
          properties: {
            parent_id: { type: "string", description: "Parent node ID (optional)" },
            label: { type: "string", description: "Title of the node" },
            layer: { type: "string", description: "SOVERN layer (human|boss|skills|coding|etc.)" },
            status: { type: "string", description: "Initial status" },
            budget: { type: "number", description: "Optional budget value" },
          },
          required: ["label", "layer"],
        },
      },
      {
        name: "update_node",
        description: "Update metadata of an existing node",
        inputSchema: {
          type: "object",
          properties: {
            node_id: { type: "string" },
            patch: {
              type: "object",
              properties: {
                label: { type: "string" },
                status: { type: "string" },
                budget: { type: "number" },
                agent: { type: "string" },
              }
            }
          },
          required: ["node_id", "patch"],
        },
      },
      {
        name: "calculate_budget_rollup",
        description: "Calculate total budget for a specific branch",
        inputSchema: {
          type: "object",
          properties: {
            node_id: { type: "string" },
          },
          required: ["node_id"],
        },
      },
      {
        name: "create_artifact_node",
        description: "Creates an interactive UI Artifact node containing React code",
        inputSchema: {
          type: "object",
          properties: {
            code: { type: "string", description: "Raw React component code (must define an 'App' component)" },
            name: { type: "string", description: "Optional human-readable name for the artifact" },
            variant_group: { type: "string", description: "Optional group id to cluster A/B variants" },
            project_dir: { type: "string", description: "Optional target project directory for export" },
          },
          required: ["code"],
        },
      },
      {
        name: "read_artifact_decisions",
        description: "Read human approve/reject decisions recorded for canvas artifacts",
        inputSchema: {
          type: "object",
          properties: {
            variant_group: { type: "string", description: "Optional filter to a specific variant group" },
          },
        },
      }
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "read_graph":
        return {
          content: [{ type: "text", text: JSON.stringify(store.read(), null, 2) }],
        };

      case "read_branch": {
        const branch = readCanvasBranch(store.read(), args?.node_id as string);
        return {
          content: [{ type: "text", text: JSON.stringify(branch, null, 2) }],
        };
      }

      case "create_node": {
        const node = store.mutate((canvas) =>
          createCanvasNode(canvas, {
            label: args?.label as string,
            layer: args?.layer as string,
            parentId: args?.parent_id as string | undefined,
            status: args?.status as string | undefined,
            budget: args?.budget as number | undefined,
          })
        );
        return {
          content: [{ type: "text", text: `Node created with ID: ${node.id}` }],
        };
      }

      case "update_node": {
        store.mutate((canvas) =>
          updateCanvasNode(canvas, args?.node_id as string, args?.patch as any)
        );
        return {
          content: [{ type: "text", text: `Node ${args?.node_id} updated successfully.` }],
        };
      }

      case "calculate_budget_rollup": {
        const total = calculateCanvasRollup(store.read(), args?.node_id as string);
        return {
          content: [{ type: "text", text: `Total rollup budget for ${args?.node_id}: $${total}` }],
        };
      }

      case "create_artifact_node": {
        const e = appendArtifact({
          code: args?.code as string,
          name: args?.name as string | undefined,
          variant_group: args?.variant_group as string | undefined,
          project_dir: args?.project_dir as string | undefined,
        });
        return {
          content: [{ type: "text", text: `Artifact ${e.id} queued to canvas inbox` + (e.variant_group ? ` (group ${e.variant_group})` : '') }],
        };
      }

      case "read_artifact_decisions": {
        const variantGroup = args?.variant_group as string | undefined;
        const decisions = readDecisions().filter(d => !variantGroup || d.variant_group === variantGroup);
        return {
          content: [{ type: "text", text: JSON.stringify(decisions) }],
        };
      }

      default:
        throw new Error(`Tool not found: ${name}`);
    }
  } catch (error: any) {
    return {
      isError: true,
      content: [{ type: "text", text: error.message }],
    };
  }
});

async function main() {
  console.error(`sovern-mindmap-server: graph backend: ${store.path}`);
  if (!store.exists()) {
    console.error(
      "sovern-mindmap-server: board file not found — reads return an empty graph; " +
        "the first mutation will create it"
    );
  }
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

// Провал старта stdio-сервера не должен завершаться с exit 0.
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
