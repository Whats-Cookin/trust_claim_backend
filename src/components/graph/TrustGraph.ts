/// <reference lib="dom" />
/// <reference lib="dom.iterable" />
/// <reference lib="esnext.asynciterable" />
/// <reference lib="webworker" />

import { registerGraphContextMenu } from '../../utils';

/**
 * Interface for graph node data structure
 */
interface GraphNodeData {
  id: string;
  label: string;
  entType: string;
  raw: Record<string, unknown>;
}

/**
 * Interface for graph edge data structure
 */
interface GraphEdgeData {
  id: string;
  relation: string;
  source: string;
  target: string;
  raw: Record<string, unknown>;
}

/**
 * Interface for graph data structure
 */
interface GraphData {
  nodes: Array<{ data: GraphNodeData }>;
  edges: Array<{ data: GraphEdgeData }>;
}

/**
 * Interface for API response data
 */
interface ExpandNodeResponse {
  success: boolean;
  message?: string;
  nodes: Array<{ data: GraphNodeData }>;
  edges: Array<{ data: GraphEdgeData }>;
}

/**
 * Node entity types
 */
enum EntityType {
  SUBJECT = 'SUBJECT',
  CLAIM = 'CLAIM',
  ISSUER = 'ISSUER',
  VALIDATOR = 'VALIDATOR'
}

/**
 * Node ID prefixes
 */
enum NodePrefix {
  SUBJECT = 'subject_',
  CLAIM = 'claim_',
  ISSUER = 'issuer_',
  VALIDATOR = 'validator_'
}

/**
 * Edge relation types
 */
enum RelationType {
  ABOUT = 'about',
  ISSUED = 'issued',
  VALIDATES = 'validates',
  HAS_CREDENTIAL = 'has_credential'
}

/**
 * TrustGraph manages the visualization and interaction with the trust claim graph
 */
export class TrustGraph {
  // Cytoscape instance
  private cy: any;
  private apiBaseUrl: string;
  private container: HTMLElement;
  private isInitialized: boolean = false;
  
  /**
   * Constructor for the TrustGraph
   * @param container The HTML element where the graph will be rendered
   * @param apiBaseUrl The base URL for API calls
   */
  constructor(container: HTMLElement, apiBaseUrl: string = '') {
    this.container = container;
    this.apiBaseUrl = apiBaseUrl;
  }
  
  /**
   * Initialize the graph with data
   * @param initialData Initial graph data (nodes and edges)
   */
  init(initialData: GraphData): void {
    if (typeof window.cytoscape === 'undefined') {
      console.error('Cytoscape library not found. Make sure it is loaded.');
      return;
    }
    
    if (this.isInitialized) {
      this.cy.destroy();
    }
    
    // Initialize Cytoscape
    this.cy = window.cytoscape({
      container: this.container,
      elements: {
        nodes: initialData.nodes || [],
        edges: initialData.edges || [],
      },
      style: this.getGraphStyle(),
      layout: this.getInitialLayout(),
    });
    
    // Register event handlers
    this.registerClickHandlers();
    this.registerContextMenu();
    
    this.isInitialized = true;
  }
  
  /**
   * Get the initial layout configuration
   */
  private getInitialLayout(): any {
    return {
      name: 'concentric',
      concentric: (node: any): number => {
        // Put subject nodes in the center
        if (node.data('entType') === EntityType.SUBJECT) {
          return 10;
        } 
        // Claims around the subject
        else if (node.data('entType') === EntityType.CLAIM) {
          return 5;
        }
        // Issuers and validators in the outer ring
        return 1;
      },
      levelWidth: (): number => 1,
      animate: true,
      animationDuration: 500,
    };
  }
  
  /**
   * Get the styling for the graph
   */
  private getGraphStyle(): Array<Record<string, any>> {
    return [
      {
        selector: 'node',
        style: {
          'label': 'data(label)',
          'text-valign': 'center',
          'text-halign': 'center',
          'color': '#fff',
          'background-color': '#666',
          'text-outline-width': 2,
          'text-outline-color': '#666',
          'font-size': 14,
        }
      },
      {
        selector: `node[entType = "${EntityType.SUBJECT}"]`,
        style: {
          'background-color': '#0a0',
          'shape': 'ellipse',
          'text-outline-color': '#0a0',
        }
      },
      {
        selector: `node[entType = "${EntityType.CLAIM}"]`,
        style: {
          'background-color': '#00c',
          'shape': 'round-rectangle',
          'text-outline-color': '#00c',
        }
      },
      {
        selector: `node[entType = "${EntityType.ISSUER}"]`,
        style: {
          'background-color': '#c00',
          'shape': 'diamond',
          'text-outline-color': '#c00',
        }
      },
      {
        selector: `node[entType = "${EntityType.VALIDATOR}"]`,
        style: {
          'background-color': '#c0c',
          'shape': 'star',
          'text-outline-color': '#c0c',
        }
      },
      {
        selector: 'edge',
        style: {
          'width': 2,
          'line-color': '#999',
          'target-arrow-color': '#999',
          'target-arrow-shape': 'triangle',
          'curve-style': 'bezier',
          'label': 'data(relation)',
          'font-size': 12,
          'color': '#777',
          'text-background-opacity': 1,
          'text-background-color': '#fff',
          'text-background-padding': 3,
        }
      },
      {
        selector: `edge[relation = "${RelationType.ABOUT}"]`,
        style: {
          'line-color': '#0a0',
          'target-arrow-color': '#0a0',
        }
      },
      {
        selector: `edge[relation = "${RelationType.ISSUED}"]`,
        style: {
          'line-color': '#c00',
          'target-arrow-color': '#c00',
        }
      },
      {
        selector: `edge[relation = "${RelationType.VALIDATES}"]`,
        style: {
          'line-color': '#c0c',
          'target-arrow-color': '#c0c',
        }
      },
    ];
  }
  
  /**
   * Register click handlers for nodes
   */
  private registerClickHandlers(): void {
    this.cy.on('tap', 'node', (evt: any) => {
      const node = evt.target;
      const nodeId = node.id();
      const nodeInfo = this.extractNodeInfo(nodeId);
      
      if (nodeInfo.type && nodeInfo.value) {
        this.expandNode(nodeInfo.type, nodeInfo.value, 'click');
      }
    });
  }
  
  /**
   * Extract node type and value from node ID
   */
  private extractNodeInfo(nodeId: string): { type: string, value: string } {
    let type = '';
    let value = '';
    
    if (nodeId.startsWith(NodePrefix.SUBJECT)) {
      type = 'subject';
      value = nodeId.replace(NodePrefix.SUBJECT, '');
    } else if (nodeId.startsWith(NodePrefix.CLAIM)) {
      type = 'claim';
      value = nodeId.replace(NodePrefix.CLAIM, '');
    } else if (nodeId.startsWith(NodePrefix.ISSUER)) {
      type = 'issuer';
      value = nodeId.replace(NodePrefix.ISSUER, '');
    } else if (nodeId.startsWith(NodePrefix.VALIDATOR)) {
      type = 'validator';
      value = nodeId.replace(NodePrefix.VALIDATOR, '');
    }
    
    return { type, value };
  }
  
  /**
   * Register right-click context menu
   */
  private registerContextMenu(): void {
    registerGraphContextMenu(this.cy, (nodeValue: string, nodeType: string) => {
      this.expandNode(nodeType, nodeValue, 'rightclick');
    });
  }
  
  /**
   * Expand a node by fetching additional data
   * @param nodeType Type of node (subject, claim, issuer, validator)
   * @param nodeValue Value/ID of the node
   * @param expandType Type of expansion (click or rightclick)
   */
  private async expandNode(nodeType: string, nodeValue: string, expandType: string = 'click'): Promise<void> {
    try {
      const url = `${this.apiBaseUrl}/api/graph/expand?nodeType=${encodeURIComponent(nodeType)}&nodeValue=${encodeURIComponent(nodeValue)}&expandType=${encodeURIComponent(expandType)}`;
      const response = await fetch(url);
      
      if (!response.ok) {
        console.error('Failed to expand node:', await response.text());
        return;
      }
      
      const data: ExpandNodeResponse = await response.json();
      
      if (!data.success) {
        console.error('Failed to expand node:', data.message);
        return;
      }
      
      // Process new nodes and edges
      this.addNewNodesAndEdges(data.nodes, data.edges);
      
      // Re-run layout
      this.runLayout();
    } catch (error) {
      console.error('Error expanding node:', error);
    }
  }
  
  /**
   * Add new nodes and edges to the graph
   * @param nodes New nodes to add
   * @param edges New edges to add
   */
  private addNewNodesAndEdges(
    nodes: Array<{ data: GraphNodeData }>, 
    edges: Array<{ data: GraphEdgeData }>
  ): void {
    if (!nodes || !edges) {
      return;
    }
    
    // Add new nodes that don't already exist
    for (const node of nodes) {
      if (!this.cy.getElementById(node.data.id).length) {
        this.cy.add({
          group: 'nodes',
          data: node.data
        });
      }
    }
    
    // Add new edges that don't already exist
    for (const edge of edges) {
      if (!this.cy.getElementById(edge.data.id).length) {
        this.cy.add({
          group: 'edges',
          data: edge.data
        });
      }
    }
  }
  
  /**
   * Run the graph layout algorithm
   */
  private runLayout(): void {
    const layout = this.cy.layout({
      name: 'cose',
      animate: true,
      animationDuration: 500,
      nodeDimensionsIncludeLabels: true,
      refresh: 20,
      fit: true,
      padding: 30,
      randomize: false,
      nodeRepulsion: 8000,
      nodeOverlap: 20,
      idealEdgeLength: 100,
    });
    
    layout.run();
  }
}

// Declare cytoscape on window object for TypeScript
declare global {
  interface Window {
    cytoscape: any;
  }
}

export default TrustGraph; 