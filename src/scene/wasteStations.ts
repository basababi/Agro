import {
  BoxGeometry,
  CanvasTexture,
  Group,
  Mesh,
  MeshStandardMaterial,
  SRGBColorSpace,
  type Object3D,
} from 'three';
import { SLOPE } from './coords';

const STREAMS = [
  { code: 'Ц', color: '#2477b8' }, // paper and recyclable packaging
  { code: 'Ш', color: '#e2b331' }, // plastic and metal containers
  { code: 'О', color: '#3f8a55' }, // food and other organic waste
  { code: 'Б', color: '#75563f' }, // residual waste
] as const;

function labelTexture(code: string, background: string) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const context = canvas.getContext('2d');
  if (context) {
    context.fillStyle = background;
    context.fillRect(0, 0, 128, 128);
    context.strokeStyle = '#ffffff';
    context.lineWidth = 7;
    context.strokeRect(6, 6, 116, 116);
    context.fillStyle = '#ffffff';
    context.font = 'bold 88px Arial, sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(code, 64, 68);
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

const BIN_BODY = new MeshStandardMaterial({ color: '#303b3b', roughness: 0.78 });
const STREAM_MATERIALS = STREAMS.map(({ color }) => new MeshStandardMaterial({ color, roughness: 0.62 }));
const LABEL_MATERIALS = STREAMS.map(({ code, color }) => new MeshStandardMaterial({ map: labelTexture(code, color), roughness: 0.72 }));
const SIGN_BOARD = new MeshStandardMaterial({ color: '#f2eee4', roughness: 0.86 });
const SIGN_FRAME = new MeshStandardMaterial({ color: '#415a48', roughness: 0.8 });

function addBin(group: Group, x: number, width: number, height: number, depth: number, index: number) {
  const body = new Mesh(new BoxGeometry(width, height, depth), BIN_BODY);
  body.position.set(x, height / 2, 0);
  body.userData.solid = false;
  group.add(body);

  const lid = new Mesh(new BoxGeometry(width + 0.025, 0.09, depth + 0.035), STREAM_MATERIALS[index]);
  lid.position.set(x, height + 0.045, 0);
  lid.userData.solid = false;
  group.add(lid);

  const label = new Mesh(new BoxGeometry(width * 0.66, height * 0.3, 0.018), LABEL_MATERIALS[index]);
  label.position.set(x, height * 0.66, depth / 2 + 0.012);
  label.userData.solid = false;
  group.add(label);
}

function addStation(parent: Object3D, lx: number, ly: number, industrial = false) {
  const group = new Group();
  group.name = industrial ? 'WasteStation_service' : 'WasteStation_4_stream';
  group.userData.group = 'outdoor';
  group.position.set(lx, -SLOPE * ly, -ly);

  const width = industrial ? 0.72 : 0.38;
  const height = industrial ? 1.12 : 0.76;
  const depth = industrial ? 0.92 : 0.48;
  const gap = industrial ? 0.06 : 0.075;
  const stride = width + gap;
  STREAMS.forEach((_, index) => addBin(group, (index - 1.5) * stride, width, height, depth, index));

  const boardHeight = industrial ? 0.48 : 0.38;
  const boardWidth = industrial ? 0.9 : 0.72;
  const signY = height + (industrial ? 0.34 : 0.28);
  const post = new Mesh(new BoxGeometry(0.055, signY, 0.055), SIGN_FRAME);
  post.position.set(0, signY / 2, -depth / 2 - 0.08);
  post.userData.solid = false;
  group.add(post);
  const board = new Mesh(new BoxGeometry(boardWidth, boardHeight, 0.06), SIGN_BOARD);
  board.position.set(0, signY, -depth / 2 - 0.08);
  board.userData.solid = false;
  group.add(board);
  for (let index = 0; index < STREAMS.length; index++) {
    const stripe = new Mesh(new BoxGeometry(boardWidth * 0.18, boardHeight * 0.68, 0.012), STREAM_MATERIALS[index]);
    stripe.position.set((index - 1.5) * boardWidth * 0.21, signY, -depth / 2 - 0.042);
    stripe.userData.solid = false;
    group.add(stripe);
  }
  parent.add(group);
}

/** Adds four-stream sorting points at the gate, wings and visitor areas, plus the service station. */
export function addWasteStations(frame: Object3D) {
  if (frame.getObjectByName('WasteStations')) return;
  const stations = new Group();
  stations.name = 'WasteStations';
  stations.userData.group = 'outdoor';
  addStation(stations, -9.5, -16.2, true);
  addStation(stations, -16.1, 0.2);
  addStation(stations, 16.1, 1.4);
  addStation(stations, 8.4, 17.1);
  addStation(stations, -10.0, 11.2);
  addStation(stations, 15.0, 12.3);
  frame.add(stations);
}
