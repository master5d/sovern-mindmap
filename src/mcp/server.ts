import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { GraphManager } from "../utils/graphManager.js";
import { SOVERNLayer, NodeStatus } from "../types/index.js";

// In a real Phase 3, this would connect to the Tauri state via IPC or a Shared File
// For now, we initialize an internal GraphManager instance to demonstrate the logic.
const graphManager = new GraphManager();

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
          content: [{ type: "text", text: JSON.stringify(graphManager.toCanvas(), null, 2) }],
        };

      case "create_node": {
        const id = crypto.randomUUID();
        const newNode = {
          id,
          type: 'sovern' as const,
          position: { x: Math.random() * 500, y: Math.random() * 500 },
          data: {
            label: args?.label as string,
            layer: args?.layer as SOVERNLayer,
            status: (args?.status as NodeStatus) || 'idle',
            budget: args?.budget as number,
          },
        };
        graphManager.addNode(newNode, args?.parent_id as string);
        return {
          content: [{ type: "text", text: `Node created with ID: ${id}` }],
        };
      }

      case "update_node": {
        graphManager.updateNode(args?.node_id as string, args?.patch as any);
        return {
          content: [{ type: "text", text: `Node ${args?.node_id} updated successfully.` }],
        };
      }

      case "calculate_budget_rollup": {
        graphManager.recalculate();
        const nodes = graphManager.getNodes();
        const node = nodes.find(n => n.id === args?.node_id);
        const total = node?.data.rollupBudget || node?.data.budget || 0;
        return {
          content: [{ type: "text", text: `Total rollup budget for ${args?.node_id}: $${total}` }],
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
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
