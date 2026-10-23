'use client';

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import VaultFallback from './VaultFallback';

export default function VaultCanvas() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hasWebGlError, setHasWebGlError] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Detect prefers-reduced-motion
    const prefersReducedMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)'
    ).matches;

    // 1. Scene setup
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(
      45,
      container.clientWidth / container.clientHeight,
      0.1,
      1000
    );
    camera.position.set(0, 0, 7.5);

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        powerPreference: 'high-performance',
      });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(container.clientWidth, container.clientHeight);
      container.appendChild(renderer.domElement);
    } catch {
      setTimeout(() => setHasWebGlError(true), 0);
      return;
    }

    // 2. Lighting (Deep space cyberpunk lighting)
    const ambientLight = new THREE.AmbientLight(0x0f172a, 2.5);
    scene.add(ambientLight);

    const cyanPointLight = new THREE.PointLight(0x06b6d4, 4, 15);
    cyanPointLight.position.set(3, 4, 4);
    scene.add(cyanPointLight);

    const violetPointLight = new THREE.PointLight(0x8b5cf6, 3.5, 15);
    violetPointLight.position.set(-3, -3, 3);
    scene.add(violetPointLight);

    // 3. Vault Assembly Group
    const vaultGroup = new THREE.Group();
    scene.add(vaultGroup);

    // --- A. Outer Vault Cube (Glassmorphic wireframe & semi-transparent faces) ---
    const outerBoxGeo = new THREE.BoxGeometry(2.4, 2.4, 2.4);
    const outerBoxMat = new THREE.MeshPhysicalMaterial({
      color: 0x0f172a,
      metalness: 0.2,
      roughness: 0.1,
      transmission: 0.85,
      thickness: 0.5,
      transparent: true,
      opacity: 0.35,
    });
    const outerBox = new THREE.Mesh(outerBoxGeo, outerBoxMat);
    vaultGroup.add(outerBox);

    const outerEdgesGeo = new THREE.EdgesGeometry(outerBoxGeo);
    const outerEdgesMat = new THREE.LineBasicMaterial({
      color: 0x06b6d4,
      linewidth: 1.5,
      transparent: true,
      opacity: 0.85,
    });
    const outerEdges = new THREE.LineSegments(outerEdgesGeo, outerEdgesMat);
    vaultGroup.add(outerEdges);

    // --- B. Inner Cryptographic Document Core ---
    const innerCoreGroup = new THREE.Group();
    vaultGroup.add(innerCoreGroup);

    const coreGeo = new THREE.BoxGeometry(1.2, 1.5, 0.4);
    const coreMat = new THREE.MeshStandardMaterial({
      color: 0x1e1b4b,
      emissive: 0x4338ca,
      emissiveIntensity: 0.45,
      metalness: 0.8,
      roughness: 0.2,
    });
    const coreMesh = new THREE.Mesh(coreGeo, coreMat);
    innerCoreGroup.add(coreMesh);

    const coreEdgesGeo = new THREE.EdgesGeometry(coreGeo);
    const coreEdgesMat = new THREE.LineBasicMaterial({
      color: 0xa855f7,
      linewidth: 2,
    });
    const coreEdges = new THREE.LineSegments(coreEdgesGeo, coreEdgesMat);
    innerCoreGroup.add(coreEdges);

    // --- C. Orbiting Security Nodes (4 Anchors) ---
    const nodeGroup = new THREE.Group();
    vaultGroup.add(nodeGroup);
    const nodeGeo = new THREE.OctahedronGeometry(0.14, 0);
    const nodeMat = new THREE.MeshStandardMaterial({
      color: 0x22d3ee,
      emissive: 0x06b6d4,
      emissiveIntensity: 0.9,
      roughness: 0.2,
    });

    const nodeDist = 1.9;
    const nodePositions = [
      [nodeDist, nodeDist, 0],
      [-nodeDist, nodeDist, 0],
      [-nodeDist, -nodeDist, 0],
      [nodeDist, -nodeDist, 0],
    ];

    const nodes: THREE.Mesh[] = [];
    nodePositions.forEach(([x, y, z]) => {
      const node = new THREE.Mesh(nodeGeo, nodeMat);
      node.position.set(x, y, z);
      nodeGroup.add(node);
      nodes.push(node);
    });

    // --- D. Lightweight Animated Particle Background ---
    const particleCount = 120;
    const particleGeo = new THREE.BufferGeometry();
    const particlePositions = new Float32Array(particleCount * 3);
    for (let i = 0; i < particleCount * 3; i += 3) {
      particlePositions[i] = (Math.random() - 0.5) * 16;
      particlePositions[i + 1] = (Math.random() - 0.5) * 12;
      particlePositions[i + 2] = (Math.random() - 0.5) * 10 - 2;
    }
    particleGeo.setAttribute(
      'position',
      new THREE.BufferAttribute(particlePositions, 3)
    );

    const particleMat = new THREE.PointsMaterial({
      color: 0x38bdf8,
      size: 0.055,
      transparent: true,
      opacity: 0.6,
    });
    const particles = new THREE.Points(particleGeo, particleMat);
    scene.add(particles);

    // 4. Pointer Interaction
    const targetRotation = { x: 0.2, y: 0.3 };
    const currentRotation = { x: 0.2, y: 0.3 };

    const handlePointerMove = (e: PointerEvent) => {
      if (prefersReducedMotion) return;
      const rect = container.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
      targetRotation.y = x * 0.45;
      targetRotation.x = -y * 0.35 + 0.2;
    };

    container.addEventListener('pointermove', handlePointerMove);

    // 5. Responsive Resize Handling
    const handleResize = () => {
      if (!container) return;
      const width = container.clientWidth;
      const height = container.clientHeight;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    };

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(container);

    // 6. Animation Loop
    let animationFrameId: number;
    const clock = new THREE.Clock();

    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);

      const delta = clock.getDelta();
      const elapsedTime = clock.getElapsedTime();

      if (!prefersReducedMotion) {
        // Smooth rotation damping toward pointer target
        currentRotation.x += (targetRotation.x - currentRotation.x) * 0.05;
        currentRotation.y += (targetRotation.y - currentRotation.y) * 0.05;

        // Subtle ambient continuous rotation
        vaultGroup.rotation.y = currentRotation.y + elapsedTime * 0.18;
        vaultGroup.rotation.x = currentRotation.x + Math.sin(elapsedTime * 0.4) * 0.08;

        // Differential core spin
        innerCoreGroup.rotation.y = -elapsedTime * 0.25;
        innerCoreGroup.rotation.z = Math.sin(elapsedTime * 0.5) * 0.08;

        // Orbit security nodes
        nodeGroup.rotation.z = elapsedTime * 0.3;
        nodes.forEach((n, idx) => {
          n.rotation.x += delta * (1 + idx * 0.2);
          n.rotation.y += delta * 1.5;
        });

        // Drifting particles
        particles.rotation.y = elapsedTime * 0.02;
      }

      renderer.render(scene, camera);
    };

    animate();

    // 7. Cleanup
    return () => {
      cancelAnimationFrame(animationFrameId);
      resizeObserver.disconnect();
      container.removeEventListener('pointermove', handlePointerMove);

      if (renderer.domElement && container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
      renderer.dispose();

      outerBoxGeo.dispose();
      outerBoxMat.dispose();
      outerEdgesGeo.dispose();
      outerEdgesMat.dispose();
      coreGeo.dispose();
      coreMat.dispose();
      coreEdgesGeo.dispose();
      coreEdgesMat.dispose();
      nodeGeo.dispose();
      nodeMat.dispose();
      particleGeo.dispose();
      particleMat.dispose();
    };
  }, []);

  if (hasWebGlError) {
    return <VaultFallback />;
  }

  return (
    <div
      ref={containerRef}
      className="relative w-full h-[360px] sm:h-[440px] flex items-center justify-center overflow-hidden rounded-2xl border border-cyan-500/20 bg-slate-950/70 shadow-[0_0_50px_rgba(6,182,212,0.1)] cursor-grab active:cursor-grabbing"
      aria-label="Interactive 3D TrustVault cryptographic cube demonstrating isolated multi-layer containment"
      role="img"
    >
      {/* Background ambient radial highlight */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(6,182,212,0.12)_0%,rgba(139,92,246,0.06)_40%,transparent_70%)] pointer-events-none" />

      {/* Cybernetic subtle HUD overlay */}
      <div className="absolute top-4 left-4 z-10 flex items-center gap-2 rounded-full border border-cyan-500/30 bg-slate-900/80 px-3 py-1 backdrop-blur-md pointer-events-none">
        <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
        <span className="text-[11px] font-mono text-cyan-300 font-semibold tracking-wider uppercase">
          Visual 3D Architecture Model (Procedural)
        </span>
      </div>

      <div className="absolute bottom-4 right-4 z-10 rounded-md border border-slate-800 bg-slate-950/80 px-2.5 py-1 text-[10px] font-mono text-slate-400 backdrop-blur-md pointer-events-none">
        Interactive preview • Zero-trust document core (Planned Phase 4/5 storage)
      </div>
    </div>
  );
}
