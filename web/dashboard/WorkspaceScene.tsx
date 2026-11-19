import React, { useEffect, useRef, useState } from "react";
import { BookOpen, Files, Sparkles } from "lucide-react";
export default function WorkspaceScene({
  go,
  theme = "scholar",
  motion = true,
}: any) {
  const host = useRef<HTMLDivElement>(null),
    [ready, setReady] = useState(false);
  useEffect(() => {
    let disposed = false,
      cleanup = () => {};
    setReady(false);
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!motion || reduced) return;
    void import("three")
      .then((T) => {
        if (disposed || !host.current) return;
        const el = host.current;
        let renderer: any;
        try {
          renderer = new T.WebGLRenderer({
            alpha: true,
            antialias: true,
            powerPreference: "low-power",
          });
        } catch {
          return;
        }
        renderer.setPixelRatio(Math.min(devicePixelRatio, 1.6));
        renderer.setClearColor(0, 0);
        renderer.domElement.setAttribute("aria-hidden", "true");
        el.prepend(renderer.domElement);
        const scene = new T.Scene(),
          camera = new T.PerspectiveCamera(34, 1, 0.1, 40);
        camera.position.set(0, 2.3, 8);
        camera.lookAt(0, 0, 0);
        scene.add(new T.AmbientLight(0xffffff, 2.3));
        const key = new T.DirectionalLight(0xffffff, 4);
        key.position.set(-3, 5, 4);
        scene.add(key);
        const colors =
          theme === "obsidian"
            ? [0x7fe4ce, 0xceb7ff, 0xf5c17e]
            : [0x4c8774, 0xd49a69, 0xa9b8aa];
        const group = new T.Group();
        scene.add(group);
        const picks: any[] = [],
          nodes: any[] = [];
        for (let i = 0; i < 3; i++) {
          const card = new T.Group();
          card.position.set((i - 1) * 1.65, i === 1 ? 0.35 : 0, 0);
          card.rotation.set(-0.16, (i - 1) * -0.14, (i - 1) * -0.08);
          const geo = new T.BoxGeometry(1.32, 1.7, 0.12),
            mat = new T.MeshStandardMaterial({
              color: theme === "obsidian" ? 0x223246 : 0xfbfaf4,
              roughness: 0.6,
              metalness: 0.1,
            });
          for (let p = 0; p < 3; p++) {
            const mesh = new T.Mesh(geo, mat);
            mesh.position.set(p * 0.04, -p * 0.04, -p * 0.07);
            mesh.userData.route = ["policies", "notes", "results"][i];
            card.add(mesh);
            picks.push(mesh);
          }
          const badge = new T.Mesh(
            new T.TorusGeometry(0.24, 0.045, 10, 40),
            new T.MeshStandardMaterial({
              color: colors[i],
              metalness: 0.35,
              roughness: 0.35,
            }),
          );
          badge.position.set(0, 0.38, 0.14);
          card.add(badge);
          for (let l = 0; l < 3; l++) {
            const line = new T.Mesh(
              new T.BoxGeometry(l === 2 ? 0.48 : 0.85, 0.045, 0.018),
              new T.MeshStandardMaterial({
                color: colors[i],
                transparent: true,
                opacity: 0.55,
              }),
            );
            line.position.set(l === 2 ? -0.18 : 0, -0.15 - l * 0.18, 0.14);
            card.add(line);
          }
          nodes.push(card);
          group.add(card);
        }
        const orbit = new T.Mesh(
          new T.TorusGeometry(2.65, 0.012, 8, 100),
          new T.MeshBasicMaterial({
            color: colors[0],
            transparent: true,
            opacity: 0.2,
          }),
        );
        orbit.rotation.x = 1.32;
        orbit.position.y = -0.7;
        scene.add(orbit);
        const pointer = new T.Vector2(),
          ray = new T.Raycaster();
        let targetX = 0,
          targetY = 0,
          raf = 0,
          visible = true,
          last = 0,
          elapsed = 0;
        const mobile = matchMedia("(max-width:760px)").matches;
        const render = (time: number) => {
          raf = 0;
          if (disposed || !visible || document.hidden) return;
          if (time - last > 33) {
            elapsed = time / 1000;
            group.rotation.y += (targetX - group.rotation.y) * 0.06;
            group.rotation.x += (targetY - group.rotation.x) * 0.06;
            for (let i = 0; i < nodes.length; i++)
              nodes[i].position.y =
                (i === 1 ? 0.35 : 0) +
                (mobile ? 0 : Math.sin(elapsed * 0.7 + i) * 0.08);
            renderer.render(scene, camera);
            last = time;
          }
          raf = requestAnimationFrame(render);
        };
        const start = () => {
          if (!raf && visible && !document.hidden)
            raf = requestAnimationFrame(render);
        };
        const move = (e: PointerEvent) => {
          const r = el.getBoundingClientRect();
          targetX = ((e.clientX - r.left) / r.width - 0.5) * 0.4;
          targetY = ((e.clientY - r.top) / r.height - 0.5) * 0.15;
          pointer.set(
            ((e.clientX - r.left) / r.width) * 2 - 1,
            -((e.clientY - r.top) / r.height) * 2 + 1,
          );
          ray.setFromCamera(pointer, camera);
          el.style.cursor = ray.intersectObjects(picks).length
            ? "pointer"
            : "default";
        };
        const click = (e: PointerEvent) => {
          if ((e.target as HTMLElement).closest("button")) return;
          move(e);
          const hit = ray.intersectObjects(picks)[0];
          if (hit) go(hit.object.userData.route);
        };
        el.addEventListener("pointermove", move);
        el.addEventListener("click", click as any);
        const resize = new ResizeObserver(() => {
          const r = el.getBoundingClientRect();
          renderer.setSize(r.width, r.height);
          camera.aspect = r.width / Math.max(1, r.height);
          camera.updateProjectionMatrix();
          start();
        });
        resize.observe(el);
        const intersection = new IntersectionObserver((entries) => {
          visible = entries[0].isIntersecting;
          start();
        });
        intersection.observe(el);
        const visibility = () => start();
        document.addEventListener("visibilitychange", visibility);
        start();
        setReady(true);
        cleanup = () => {
          cancelAnimationFrame(raf);
          resize.disconnect();
          intersection.disconnect();
          document.removeEventListener("visibilitychange", visibility);
          el.removeEventListener("pointermove", move);
          el.removeEventListener("click", click as any);
          scene.traverse((o: any) => {
            o.geometry?.dispose();
            if (o.material)
              (Array.isArray(o.material) ? o.material : [o.material]).forEach(
                (m: any) => m.dispose(),
              );
          });
          renderer.dispose();
          renderer.domElement.remove();
        };
      })
      .catch(() => {});
    return () => {
      disposed = true;
      cleanup();
    };
  }, [theme, motion]);
  return (
    <div
      ref={host}
      className={
        "workspace-scene " + (ready ? "scene-ready" : "scene-fallback")
      }
      aria-label="资料到作品的三维工作空间"
    >
      {!ready && (
        <div className="scene-paper-stack">
          <span />
          <span />
          <span>
            <Sparkles size={40} />
          </span>
        </div>
      )}
      <div className="scene-navigation">
        {[
          [BookOpen, "原始资料", "policies"],
          [Sparkles, "知识库", "notes"],
          [Files, "成果库", "results"],
        ].map(([Icon, label, route]: any) => (
          <button key={route} onClick={() => go(route)}>
            <Icon size={15} />
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
