/* 3D "cash city": one pair of towers per month. Left tower = money in (sales, other income),
   right tower = money out stacked by category. Forecast months are glass. Loaded lazily. */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { ContactShadows, Edges, Environment, Html, Lightformer, OrbitControls, RoundedBox } from '@react-three/drei';
import { Bloom, EffectComposer, ToneMapping } from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';
import { easing } from 'maath';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import {
  ALL_CATEGORIES,
  CATEGORIES,
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
  inr,
  inrShort,
  monthLabel,
  monthShort,
  yearOf,
  type CategoryId,
  type ExpenseCategory,
  type MonthIndex,
} from '../../engine';
import type { MonthView } from '../model';
import { CAT_VAR, cssVar, type Theme } from '../theme';
import { Icon } from '../components/Icons';

/* ---------- layout constants (world units) ---------- */
const SPACING = 2.3; // between months
const MAX_H = 6.4; // tallest tower
const BAR = 0.86; // tower footprint
const ROW_Z = 0.58; // in-tower behind, out-tower in front
const GAP = 0.035; // gap between stacked segments
const DEPTH = 5.4; // platform depth

interface Props {
  months: MonthView[];
  selected: MonthIndex;
  onSelect: (m: MonthIndex) => void;
  hidden: ReadonlySet<ExpenseCategory>;
  theme: Theme;
  reducedMotion: boolean;
  onContextLost: () => void;
}

interface Segment {
  id: string;
  col: number;
  month: MonthView;
  row: 'in' | 'out';
  cat: CategoryId;
  value: number;
  height: number;
}

interface Palette {
  bg: string;
  floor: string;
  zone: string;
  brand: string;
  ink: string;
  cats: Record<CategoryId, string>;
  dark: boolean;
}

type Command = { kind: 'intro' | 'overview' | 'month' } | { kind: 'dolly'; factor: number };

export default function CashCity({ months, selected, onSelect, hidden, theme, reducedMotion, onContextLost }: Props) {
  const wrap = useRef<HTMLDivElement>(null);
  const tip = useRef<HTMLDivElement>(null);
  const [onScreen, setOnScreen] = useState(true);
  const [hover, setHover] = useState<Segment | null>(null);
  const [command, setCommand] = useState<{ c: Command; n: number }>({ c: { kind: 'intro' }, n: 0 });
  const issue = (c: Command) => setCommand((p) => ({ c, n: p.n + 1 }));

  // Palette comes from the same CSS variables as the rest of the page.
  const palette = useMemo<Palette>(
    () => ({
      bg: cssVar('--panel') || '#ffffff',
      floor: cssVar('--panel-2') || '#f4f2ed',
      zone: cssVar('--panel-3') || '#ebe8e1',
      brand: cssVar('--brand') || '#e08a00',
      ink: cssVar('--ink') || '#15171c',
      cats: Object.fromEntries(ALL_CATEGORIES.map((c) => [c, cssVar(CAT_VAR[c]) || '#888888'])) as Record<CategoryId, string>,
      dark: theme === 'dark',
    }),
    [theme],
  );

  // Fly to a month when it is selected (not on first render: that is the intro).
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    issue({ kind: 'month' });
  }, [selected]);

  // A new statement: replay the intro flight (the towers regrow on their own).
  const firstData = useRef(true);
  useEffect(() => {
    if (firstData.current) {
      firstData.current = false;
      return;
    }
    issue({ kind: 'intro' });
  }, [months]);

  // Pause rendering while the view is scrolled off screen.
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const io = new IntersectionObserver((es) => setOnScreen(es[0]?.isIntersecting ?? true), { rootMargin: '120px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const moveTip = (e: ThreeEvent<PointerEvent>) => {
    const el = wrap.current;
    const t = tip.current;
    if (!el || !t) return;
    const r = el.getBoundingClientRect();
    const x = e.nativeEvent.clientX - r.left;
    const y = e.nativeEvent.clientY - r.top;
    t.style.left = `${Math.min(x + 16, r.width - t.offsetWidth - 10)}px`;
    t.style.top = `${Math.max(10, y - t.offsetHeight - 14)}px`;
  };

  const isTouch = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;

  return (
    <div className={`city-canvas${hover ? ' hovering' : ''}`} ref={wrap} style={{ cursor: hover ? 'pointer' : 'grab' }}>
      <Canvas
        shadows={{ type: THREE.PCFShadowMap }}
        dpr={[1, 2]}
        frameloop={onScreen ? 'always' : 'never'}
        camera={{ fov: 34, near: 0.1, far: 300, position: [0, 30, 50] }}
        gl={{ antialias: true, powerPreference: 'high-performance' }}
        onCreated={({ gl }) => {
          gl.domElement.addEventListener('webglcontextlost', (e) => {
            e.preventDefault();
            onContextLost();
          });
        }}
        onPointerMissed={() => setHover(null)}
        aria-hidden="true"
      >
        <color attach="background" args={[palette.bg]} />
        <fog attach="fog" args={[palette.bg, 45, 110]} />
        <Scene
          months={months}
          selected={selected}
          onSelect={onSelect}
          hidden={hidden}
          palette={palette}
          reduced={reducedMotion}
          hovered={hover}
          onHover={(s, e) => {
            setHover(s);
            if (e) moveTip(e);
          }}
          command={command}
          isTouch={isTouch}
        />
      </Canvas>

      <div ref={tip} className="tip" hidden={!hover} style={{ zIndex: 30 }}>
        {hover && <TipBody s={hover} />}
      </div>

      <div className="hint">
        <Icon.drag />
        {isTouch ? 'Two fingers to turn' : 'Drag to turn · click a tower'}
      </div>
      <div className="city-ctrl">
        <button className="icon-btn" aria-label="Zoom in" onClick={() => issue({ kind: 'dolly', factor: 0.8 })}>
          <Icon.plus />
        </button>
        <button className="icon-btn" aria-label="Zoom out" onClick={() => issue({ kind: 'dolly', factor: 1.25 })}>
          <Icon.minus />
        </button>
        <button className="icon-btn" aria-label="Reset view" onClick={() => issue({ kind: 'overview' })}>
          <Icon.reset />
        </button>
      </div>
    </div>
  );
}

function TipBody({ s }: { s: Segment }) {
  const m = s.month;
  return (
    <>
      <span className="eyebrow">
        {monthLabel(m.month)}
        {m.forecast ? ' · forecast' : ''}
      </span>
      <b>
        <span className="sw" style={{ background: `var(${CAT_VAR[s.cat]})` }} />
        {CATEGORIES[s.cat].name}
      </b>
      <span className="num big">{inr(s.value)}</span>
      {s.row === 'out' ? (
        <span className="row">
          <span>Share of money out</span>
          <span className="num">{Math.round((s.value / (m.outflow || 1)) * 100)}%</span>
        </span>
      ) : (
        <span className="row">
          <span>Total money in</span>
          <span className="num">{inrShort(m.inflow)}</span>
        </span>
      )}
    </>
  );
}

/* ---------- scene ---------- */

interface SceneProps {
  months: MonthView[];
  selected: MonthIndex;
  onSelect: (m: MonthIndex) => void;
  hidden: ReadonlySet<ExpenseCategory>;
  palette: Palette;
  reduced: boolean;
  hovered: Segment | null;
  onHover: (s: Segment | null, e?: ThreeEvent<PointerEvent>) => void;
  command: { c: Command; n: number };
  isTouch: boolean;
}

function Scene({ months, selected, onSelect, hidden, palette, reduced, hovered, onHover, command, isTouch }: SceneProps) {
  const n = months.length;
  const x0 = (-(n - 1) / 2) * SPACING;
  const colX = (i: number) => x0 + i * SPACING;
  const width = n * SPACING + 1.6;
  const selIndex = Math.max(0, months.findIndex((m) => m.month === selected));
  const firstForecast = months.findIndex((m) => m.forecast);

  // One scale for every month, so hiding a category never rescales the others.
  const segments = useMemo(() => {
    const max = Math.max(1, ...months.map((m) => Math.max(m.inflow, m.outflow)));
    const k = MAX_H / max;
    const out: Segment[] = [];
    months.forEach((m, col) => {
      for (const c of INCOME_CATEGORIES) {
        const v = m.byCategory[c] ?? 0;
        if (v > 0) out.push({ id: `${m.month}-in-${c}`, col, month: m, row: 'in', cat: c, value: v, height: Math.max(0.004, v * k) });
      }
      for (const c of EXPENSE_CATEGORIES) {
        const v = m.byCategory[c] ?? 0;
        if (v > 0) out.push({ id: `${m.month}-out-${c}`, col, month: m, row: 'out', cat: c, value: v, height: Math.max(0.004, v * k) });
      }
    });
    return out;
  }, [months]);

  // Visible stack height per column and row, for the value labels over the selected month.
  const stackTop = (col: number, row: 'in' | 'out') =>
    segments
      .filter((s) => s.col === col && s.row === row && !(s.row === 'out' && hidden.has(s.cat as ExpenseCategory)))
      .reduce((h, s) => h + s.height + GAP, 0);

  const sel = months[selIndex];

  return (
    <>
      <ambientLight intensity={palette.dark ? 0.35 : 0.55} />
      <hemisphereLight args={['#ffffff', palette.dark ? '#1a1f27' : '#d9d3c7', palette.dark ? 0.5 : 0.7]} />
      <directionalLight
        position={[9, 16, 10]}
        intensity={palette.dark ? 1.5 : 1.8}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.03}
        shadow-radius={6}
        shadow-camera-left={-width / 2 - 3}
        shadow-camera-right={width / 2 + 3}
        shadow-camera-top={12}
        shadow-camera-bottom={-8}
        shadow-camera-near={1}
        shadow-camera-far={60}
      />
      <Environment resolution={256} frames={1}>
        <Lightformer intensity={1.6} position={[0, 6, -10]} scale={[16, 6, 1]} />
        <Lightformer intensity={0.9} rotation-y={Math.PI / 2} position={[-12, 4, 0]} scale={[12, 4, 1]} />
        <Lightformer intensity={0.9} rotation-y={-Math.PI / 2} position={[12, 4, 0]} scale={[12, 4, 1]} />
        <Lightformer form="ring" color={palette.brand} intensity={2.4} position={[8, 9, 8]} scale={3} />
      </Environment>

      {/* platform */}
      <RoundedBox args={[width, 0.24, DEPTH]} radius={0.12} smoothness={4} position={[0, -0.12, 0]} receiveShadow>
        <meshStandardMaterial color={palette.floor} roughness={0.9} metalness={0} />
      </RoundedBox>
      {firstForecast >= 0 && (
        <mesh rotation-x={-Math.PI / 2} position={[(colX(firstForecast) - SPACING / 2 + width / 2) / 2, 0.002, 0]} receiveShadow>
          <planeGeometry args={[width / 2 - (colX(firstForecast) - SPACING / 2), DEPTH - 0.3]} />
          <meshStandardMaterial color={palette.zone} roughness={1} transparent opacity={0.85} />
        </mesh>
      )}
      <ContactShadows position={[0, 0.004, 0]} scale={[width + 2, DEPTH + 2]} resolution={1024} blur={2.6} far={7} opacity={palette.dark ? 0.75 : 0.42} />

      <SelectionTile x={colX(selIndex)} color={palette.brand} reduced={reduced} />

      <Towers segments={segments} colX={colX} hidden={hidden} palette={palette} reduced={reduced} hovered={hovered} onHover={onHover} onSelect={onSelect} />

      {/* labels */}
      {months.map((m, i) => (
        <Html key={m.month} position={[colX(i), 0, DEPTH / 2 - 0.35]} center zIndexRange={[20, 0]}>
          <button
            className={`lbl${m.forecast ? ' f' : ''}${m.month === selected ? ' sel' : ''}`}
            onClick={() => onSelect(m.month)}
            aria-label={`Show ${monthLabel(m.month, true)}`}
          >
            {monthShort(m.month)}
            {i === 0 || m.month % 12 === 0 ? ` '${String(yearOf(m.month)).slice(2)}` : ''}
          </button>
        </Html>
      ))}
      <Html position={[x0 - 1.45, 0.05, -ROW_Z]} center zIndexRange={[20, 0]}>
        <span className="lbl row">In</span>
      </Html>
      <Html position={[x0 - 1.45, 0.05, ROW_Z]} center zIndexRange={[20, 0]}>
        <span className="lbl row">Out</span>
      </Html>
      {firstForecast >= 0 && (
        <Html position={[(colX(firstForecast) + colX(n - 1)) / 2, 0.02, -DEPTH / 2 + 0.35]} center zIndexRange={[20, 0]}>
          <span className="lbl zone">FORECAST</span>
        </Html>
      )}
      {sel && (
        <>
          <Html position={[colX(selIndex) - 0.55, stackTop(selIndex, 'in') + 0.45, -ROW_Z]} center zIndexRange={[20, 0]}>
            <span className="lbl val">{inrShort(sel.inflow)}</span>
          </Html>
          <Html position={[colX(selIndex) + 0.55, stackTop(selIndex, 'out') + 0.45, ROW_Z]} center zIndexRange={[20, 0]}>
            <span className="lbl val">{inrShort(sel.outflow)}</span>
          </Html>
        </>
      )}

      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.08}
        enablePan={false}
        enableZoom={false}
        rotateSpeed={0.6}
        minPolarAngle={0.35}
        maxPolarAngle={1.38}
        minAzimuthAngle={-1.25}
        maxAzimuthAngle={1.25}
        touches={{ ONE: isTouch ? (-1 as THREE.TOUCH) : THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_ROTATE }}
      />
      <CameraRig command={command} width={width} focusX={colX(selIndex)} reduced={reduced} />

      <EffectComposer multisampling={4}>
        <Bloom mipmapBlur intensity={palette.dark ? 0.9 : 0.5} luminanceThreshold={1} luminanceSmoothing={0.3} />
        <ToneMapping mode={ToneMappingMode.NEUTRAL} />
      </EffectComposer>
    </>
  );
}

/* ---------- towers: one frame loop animates every segment ---------- */

interface TowersProps {
  segments: Segment[];
  colX: (i: number) => number;
  hidden: ReadonlySet<ExpenseCategory>;
  palette: Palette;
  reduced: boolean;
  hovered: Segment | null;
  onHover: (s: Segment | null, e?: ThreeEvent<PointerEvent>) => void;
  onSelect: (m: MonthIndex) => void;
}

function Towers({ segments, colX, hidden, palette, reduced, hovered, onHover, onSelect }: TowersProps) {
  const meshes = useRef(new Map<string, THREE.Mesh>());
  const anim = useRef(new Map<string, { s: number; glow: number }>());
  const start = useRef<number | null>(null);

  // New data: grow again from the ground.
  useEffect(() => {
    start.current = null;
    anim.current.clear();
  }, [segments]);

  useFrame((state, dt) => {
    if (start.current === null) start.current = state.clock.elapsedTime;
    const t = state.clock.elapsedTime - start.current;
    const stacks = new Map<string, number>();
    for (const seg of segments) {
      const mesh = meshes.current.get(seg.id);
      if (!mesh) continue;
      let a = anim.current.get(seg.id);
      if (!a) anim.current.set(seg.id, (a = { s: 0, glow: 0 }));
      // Bars grow on load, one month after another; hidden categories shrink away.
      const grow = reduced ? 1 : easeOutCubic(clamp01((t - 0.15 - seg.col * 0.07) / 0.9));
      const visible = !(seg.row === 'out' && hidden.has(seg.cat as ExpenseCategory));
      if (reduced) a.s = visible ? 1 : 0;
      else easing.damp(a, 's', visible ? 1 : 0, 0.18, dt);
      const f = a.s * grow;
      const stackKey = `${seg.col}-${seg.row}`;
      const base = stacks.get(stackKey) ?? 0;
      mesh.scale.set(1, Math.max(0.0005, f), 1);
      mesh.position.y = base + (seg.height * f) / 2;
      mesh.visible = f > 0.002;
      stacks.set(stackKey, base + (seg.height + GAP) * f);
      // Hover glow.
      const target = hovered?.id === seg.id ? 1 : 0;
      if (reduced) a.glow = target;
      else easing.damp(a, 'glow', target, 0.12, dt);
      const mat = mesh.material as THREE.MeshPhysicalMaterial;
      mat.emissiveIntensity = a.glow * (palette.dark ? 2.4 : 1.6);
    }
  });

  return (
    <>
      {segments.map((seg) => {
        const forecast = seg.month.forecast;
        const color = palette.cats[seg.cat];
        const z = seg.row === 'in' ? -ROW_Z : ROW_Z;
        const r = Math.min(0.06, seg.height * 0.45);
        const handlers = {
          onPointerOver: (e: ThreeEvent<PointerEvent>) => {
            e.stopPropagation();
            onHover(seg, e);
          },
          onPointerMove: (e: ThreeEvent<PointerEvent>) => {
            e.stopPropagation();
            onHover(seg, e);
          },
          onPointerOut: () => onHover(null),
          onClick: (e: ThreeEvent<MouseEvent>) => {
            e.stopPropagation();
            if (e.delta > 6) return; // it was a drag
            onSelect(seg.month.month);
          },
        };
        const material = (
          <meshPhysicalMaterial
            color={color}
            emissive={color}
            emissiveIntensity={0}
            roughness={forecast ? 0.15 : 0.38}
            metalness={0.05}
            clearcoat={forecast ? 1 : 0.6}
            clearcoatRoughness={0.22}
            envMapIntensity={0.7}
            transparent={forecast}
            opacity={forecast ? 0.34 : 1}
            depthWrite={!forecast}
          />
        );
        const ref = (m: THREE.Mesh | null) => {
          if (m) meshes.current.set(seg.id, m);
          else meshes.current.delete(seg.id);
        };
        return r > 0.01 ? (
          <RoundedBox
            key={seg.id}
            ref={ref}
            args={[BAR, seg.height, BAR]}
            radius={r}
            smoothness={3}
            position={[colX(seg.col), 0, z]}
            scale={[1, 0.0005, 1]}
            castShadow={!forecast}
            {...handlers}
          >
            {material}
            {forecast && <Edges threshold={20} color={color} />}
          </RoundedBox>
        ) : (
          <mesh key={seg.id} ref={ref} position={[colX(seg.col), 0, z]} scale={[1, 0.0005, 1]} castShadow={!forecast} {...handlers}>
            <boxGeometry args={[BAR, seg.height, BAR]} />
            {material}
          </mesh>
        );
      })}
    </>
  );
}

function SelectionTile({ x, color, reduced }: { x: number; color: string; reduced: boolean }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame((_, dt) => {
    const m = ref.current;
    if (!m) return;
    if (reduced) m.position.x = x;
    else easing.damp(m.position, 'x', x, 0.2, dt);
  });
  return (
    <RoundedBox ref={ref} args={[SPACING * 0.86, 0.02, DEPTH - 0.5]} radius={0.01} position={[x, 0.012, 0]} receiveShadow>
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.25} transparent opacity={0.22} roughness={0.6} />
    </RoundedBox>
  );
}

/* ---------- camera: intro flight, fly-to-month, zoom, reset ---------- */

function CameraRig({ command, width, focusX, reduced }: { command: { c: Command; n: number }; width: number; focusX: number; reduced: boolean }) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const size = useThree((s) => s.size);
  const controls = useThree((s) => s.controls) as unknown as OrbitControlsImpl | null;
  const goal = useRef<{ pos: THREE.Vector3; target: THREE.Vector3 } | null>(null);

  // Distance that fits the whole city in view.
  const fit = useMemo(() => {
    const half = THREE.MathUtils.degToRad(camera.fov / 2);
    const aspect = size.width / Math.max(1, size.height);
    const byWidth = (width / 2 + 0.6) / Math.tan(half) / aspect;
    const byHeight = (MAX_H + 2) / 2 / Math.tan(half);
    return Math.max(byWidth * 0.95, byHeight * 1.3, 12);
  }, [camera.fov, size.width, size.height, width]);

  useEffect(() => {
    if (!controls) return;
    controls.minDistance = 6;
    controls.maxDistance = fit * 2;
  }, [controls, fit]);

  useEffect(() => {
    if (!controls) return;
    const c = command.c;
    const sph = (target: THREE.Vector3, dist: number, az: number, el: number) =>
      target.clone().add(new THREE.Vector3(dist * Math.cos(el) * Math.sin(az), dist * Math.sin(el), dist * Math.cos(el) * Math.cos(az)));
    const overviewTarget = new THREE.Vector3(0, 2.1, 0);
    const narrow = size.width < 600;
    if (c.kind === 'intro' && narrow) {
      const target = new THREE.Vector3(focusX * 0.8, 1.9, 0.2);
      goal.current = { target, pos: sph(target, Math.max(13, fit * 0.55), -0.26, 0.42) };
      controls.target.copy(target);
      camera.position.copy(sph(target, fit * 1.2, -0.85, 0.95));
    } else if (c.kind === 'intro' || c.kind === 'overview') {
      goal.current = { target: overviewTarget, pos: sph(overviewTarget, fit * 1.18, -0.32, 0.46) };
      if (c.kind === 'intro') {
        controls.target.copy(overviewTarget);
        camera.position.copy(sph(overviewTarget, fit * 1.9, -0.85, 0.95));
      }
    } else if (c.kind === 'month') {
      const target = new THREE.Vector3(focusX * 0.8, 1.9, 0.2);
      goal.current = { target, pos: sph(target, Math.max(11, fit * 0.72), -0.26, 0.4) };
    } else if (c.kind === 'dolly') {
      const target = controls.target.clone();
      const dir = camera.position.clone().sub(target);
      const d = THREE.MathUtils.clamp(dir.length() * c.factor, controls.minDistance, controls.maxDistance);
      goal.current = { target, pos: target.clone().add(dir.setLength(d)) };
    }
    if (reduced && goal.current) {
      camera.position.copy(goal.current.pos);
      controls.target.copy(goal.current.target);
      controls.update();
      goal.current = null;
    }
    // command.n changes on every command; the other values are read at that moment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [command.n, controls]);

  // Letting go of the flight as soon as the owner drags.
  useEffect(() => {
    if (!controls) return;
    const stop = () => (goal.current = null);
    controls.addEventListener('start', stop);
    return () => controls.removeEventListener('start', stop);
  }, [controls]);

  useFrame((_, dt) => {
    const g = goal.current;
    if (!g || !controls) return;
    easing.damp3(camera.position, g.pos, 0.5, dt);
    easing.damp3(controls.target, g.target, 0.42, dt);
    controls.update();
    if (camera.position.distanceTo(g.pos) < 0.02 && controls.target.distanceTo(g.target) < 0.02) goal.current = null;
  });

  return null;
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
