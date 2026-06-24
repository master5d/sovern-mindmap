import { ReactNode } from 'react';
import {
  User, Cloud, Server, CircuitBoard, Monitor, Laptop, HardDrive,
  Router, Network, ShieldCheck, Wifi, BrainCircuit, Bot, Boxes, Webhook, Container,
} from 'lucide-react';
import { SOVERNNodeData } from '../../types';

export type ShapeKind = NonNullable<SOVERNNodeData['shape']>;

export interface ShapeRender {
  mode: 'css' | 'svg' | 'icon';
  /** css/icon mode: border-radius (and frame) classes */
  className?: string;
  /** svg mode: silhouette stretched behind the label */
  svg?: (selected: boolean) => ReactNode;
  /** icon mode: lucide icon shown above the label */
  Icon?: typeof User;
}

const strokeStyle = (selected: boolean) => ({
  stroke: selected ? 'var(--accent)' : 'var(--border-strong)',
  fill: 'var(--bg-surface)',
  strokeWidth: 2,
  vectorEffect: 'non-scaling-stroke' as const,
});

const Frame = ({ children }: { children: ReactNode }) => (
  <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
    {children}
  </svg>
);

export const SHAPE_GEOMETRY: Record<ShapeKind, ShapeRender> = {
  rectangle: { mode: 'css', className: 'rounded-none' },
  rounded: { mode: 'css', className: 'rounded-xl' },
  terminal: { mode: 'css', className: 'rounded-full' },
  note: { mode: 'css', className: 'rounded-md' },
  ellipse: { mode: 'css', className: 'rounded-[50%]' },
  decision: { mode: 'svg', svg: (s) => <Frame><polygon points="50,3 97,50 50,97 3,50" style={strokeStyle(s)} /></Frame> },
  parallelogram: { mode: 'svg', svg: (s) => <Frame><polygon points="22,8 97,8 78,92 3,92" style={strokeStyle(s)} /></Frame> },
  hexagon: { mode: 'svg', svg: (s) => <Frame><polygon points="28,6 72,6 97,50 72,94 28,94 3,50" style={strokeStyle(s)} /></Frame> },
  cylinder: { mode: 'svg', svg: (s) => (
    <Frame>
      <path d="M5,18 v64 a45,14 0 0 0 90,0 v-64" style={strokeStyle(s)} />
      <ellipse cx="50" cy="18" rx="45" ry="14" style={strokeStyle(s)} />
    </Frame>
  ) },
  document: { mode: 'svg', svg: (s) => <Frame><path d="M5,8 H95 V82 q-22.5,14 -45,0 t-45,0 Z" style={strokeStyle(s)} /></Frame> },
  actor: { mode: 'icon', Icon: User, className: 'rounded-xl' },
  cloud: { mode: 'icon', Icon: Cloud, className: 'rounded-2xl' },
  server: { mode: 'icon', Icon: Server, className: 'rounded-xl' },
  gpu: { mode: 'icon', Icon: CircuitBoard, className: 'rounded-xl' },
  workstation: { mode: 'icon', Icon: Monitor, className: 'rounded-xl' },
  laptop: { mode: 'icon', Icon: Laptop, className: 'rounded-xl' },
  storage: { mode: 'icon', Icon: HardDrive, className: 'rounded-xl' },
  router: { mode: 'icon', Icon: Router, className: 'rounded-xl' },
  switch: { mode: 'icon', Icon: Network, className: 'rounded-xl' },
  firewall: { mode: 'icon', Icon: ShieldCheck, className: 'rounded-xl' },
  wifi: { mode: 'icon', Icon: Wifi, className: 'rounded-xl' },
  model: { mode: 'icon', Icon: BrainCircuit, className: 'rounded-xl' },
  agent: { mode: 'icon', Icon: Bot, className: 'rounded-xl' },
  'vector-store': { mode: 'icon', Icon: Boxes, className: 'rounded-xl' },
  gateway: { mode: 'icon', Icon: Webhook, className: 'rounded-xl' },
  container: { mode: 'icon', Icon: Container, className: 'rounded-xl' },
};
