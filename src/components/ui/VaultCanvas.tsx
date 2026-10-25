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

    // 1. Three.js Scene & Perspective Camera
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(
      42,
      container.clientWidth / container.clientHeight,
      0.1,
      1000
    );
    camera.position.set(0, 0, 7.2);

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

    // 2. High-Fidelity Cybernetic Lighting
    const ambientLight = new THREE.AmbientLight(0x0b1329, 2.8);
    scene.add(ambientLight);

    const cyanPointLight = new THREE.PointLight(0x06b6d4, 4.5, 16);
    cyanPointLight.position.set(3.5, 4, 4.5);
    scene.add(cyanPointLight);

    const violetPointLight = new THREE.PointLight(0x8b5cf6, 3.2, 16);
    violetPointLight.position.set(-3.5, -3.5, 3.5);
    scene.add(violetPointLight);

    // Tasteful Unlocking Light Sweep Spotlight
    const sweepLight = new THREE.SpotLight(0x38bdf8, 5.0, 14, Math.PI / 4, 0.4, 1.2);
    sweepLight.position.set(0, 3, 5);
    scene.add(sweepLight);
    scene.add(sweepLight.target);

    // 3. Master Vault Assembly Group
    const masterGroup = new THREE.Group();
    scene.add(masterGroup);

    // Material Palette
    const gunmetalMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      metalness: 0.9,
      roughness: 0.28,
    });

    const doorSteelMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      metalness: 0.85,
      roughness: 0.22,
    });

    const chromeMat = new THREE.MeshStandardMaterial({
      color: 0xf8fafc,
      metalness: 0.98,
      roughness: 0.12,
    });

    const cyanGlowMat = new THREE.MeshStandardMaterial({
      color: 0x22d3ee,
      emissive: 0x06b6d4,
      emissiveIntensity: 2.5,
      roughness: 0.2,
    });

    const rivetMat = new THREE.MeshStandardMaterial({
      color: 0x64748b,
      metalness: 0.92,
      roughness: 0.3,
    });

    // --- A. Heavy Outer Vault Frame (Beveled Cylinder facing camera) ---
    const outerFrameGeo = new THREE.CylinderGeometry(2.45, 2.55, 0.45, 48);
    outerFrameGeo.rotateX(Math.PI / 2);
    const outerFrame = new THREE.Mesh(outerFrameGeo, gunmetalMat);
    masterGroup.add(outerFrame);

    // Outer Perimeter Rivets (16 bolts around the rim)
    const rivetGeo = new THREE.CylinderGeometry(0.045, 0.045, 0.08, 12);
    rivetGeo.rotateX(Math.PI / 2);
    const rivetRadius = 2.38;
    for (let i = 0; i < 16; i++) {
      const angle = (i / 16) * Math.PI * 2;
      const rivet = new THREE.Mesh(rivetGeo, rivetMat);
      rivet.position.set(
        Math.cos(angle) * rivetRadius,
        Math.sin(angle) * rivetRadius,
        0.24
      );
      masterGroup.add(rivet);
    }

    // --- B. Recessed Vault Chamber Cavity ---
    const recessGeo = new THREE.CylinderGeometry(2.1, 2.1, 0.35, 48);
    recessGeo.rotateX(Math.PI / 2);
    const recessMat = new THREE.MeshStandardMaterial({
      color: 0x060913,
      metalness: 0.92,
      roughness: 0.45,
    });
    const recessMesh = new THREE.Mesh(recessGeo, recessMat);
    recessMesh.position.z = -0.05;
    masterGroup.add(recessMesh);

    // Glowing Cyan Security Ring
    const securityRingGeo = new THREE.TorusGeometry(2.02, 0.035, 16, 64);
    const securityRing = new THREE.Mesh(securityRingGeo, cyanGlowMat);
    securityRing.position.z = 0.15;
    masterGroup.add(securityRing);

    // --- C. Protected Document Core (Softly illuminated inside the vault) ---
    const docCoreGroup = new THREE.Group();
    docCoreGroup.position.set(0, 0, -0.08);
    masterGroup.add(docCoreGroup);

    const docGeo = new THREE.BoxGeometry(0.9, 1.25, 0.06);
    const docMat = new THREE.MeshStandardMaterial({
      color: 0x1e1b4b,
      emissive: 0x38bdf8,
      emissiveIntensity: 0.8,
      metalness: 0.7,
      roughness: 0.25,
    });
    const docMesh = new THREE.Mesh(docGeo, docMat);
    docCoreGroup.add(docMesh);

    const docEdgesGeo = new THREE.EdgesGeometry(docGeo);
    const docEdgesMat = new THREE.LineBasicMaterial({
      color: 0x06b6d4,
      linewidth: 1.5,
    });
    const docEdges = new THREE.LineSegments(docEdgesGeo, docEdgesMat);
    docCoreGroup.add(docEdges);

    // --- D. Circular Vault Door Assembly ---
    const doorGroup = new THREE.Group();
    doorGroup.position.z = 0.08;
    masterGroup.add(doorGroup);

    // Main Door Disc
    const doorDiscGeo = new THREE.CylinderGeometry(1.82, 1.82, 0.22, 48);
    doorDiscGeo.rotateX(Math.PI / 2);
    const doorDisc = new THREE.Mesh(doorDiscGeo, doorSteelMat);
    doorGroup.add(doorDisc);

    // Concentric Reinforcing Rings
    const innerRingGeo = new THREE.TorusGeometry(1.25, 0.04, 16, 48);
    const innerRing = new THREE.Mesh(innerRingGeo, chromeMat);
    innerRing.position.z = 0.12;
    doorGroup.add(innerRing);

    const midRingGeo = new THREE.TorusGeometry(0.85, 0.025, 16, 48);
    const midRing = new THREE.Mesh(midRingGeo, cyanGlowMat);
    midRing.position.z = 0.12;
    doorGroup.add(midRing);

    // Radial Locking Bolts (8 heavy cylindrical bolts)
    const boltGeo = new THREE.CylinderGeometry(0.065, 0.065, 0.48, 16);
    boltGeo.rotateZ(Math.PI / 2);
    const bolts: THREE.Mesh[] = [];
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      const bolt = new THREE.Mesh(boltGeo, chromeMat);
      bolt.position.set(
        Math.cos(angle) * 1.7,
        Math.sin(angle) * 1.7,
        0.05
      );
      bolt.rotation.z = angle;
      doorGroup.add(bolt);
      bolts.push(bolt);
    }

    // --- E. Central Locking Hand Wheel Assembly ---
    const wheelGroup = new THREE.Group();
    wheelGroup.position.z = 0.22;
    doorGroup.add(wheelGroup);

    // Wheel Central Hub
    const hubGeo = new THREE.CylinderGeometry(0.32, 0.35, 0.26, 32);
    hubGeo.rotateX(Math.PI / 2);
    const hub = new THREE.Mesh(hubGeo, gunmetalMat);
    wheelGroup.add(hub);

    const hubCapGeo = new THREE.CylinderGeometry(0.18, 0.18, 0.28, 32);
    hubCapGeo.rotateX(Math.PI / 2);
    const hubCap = new THREE.Mesh(hubCapGeo, cyanGlowMat);
    wheelGroup.add(hubCap);

    // Chrome Hand Wheel Rim
    const wheelRimGeo = new THREE.TorusGeometry(0.68, 0.05, 16, 36);
    const wheelRim = new THREE.Mesh(wheelRimGeo, chromeMat);
    wheelRim.position.z = 0.1;
    wheelGroup.add(wheelRim);

    // Wheel Radial Spokes (6 spokes)
    const spokeGeo = new THREE.CylinderGeometry(0.032, 0.032, 1.36, 16);
    for (let i = 0; i < 3; i++) {
      const spoke = new THREE.Mesh(spokeGeo, chromeMat);
      spoke.position.z = 0.1;
      spoke.rotation.z = (i / 3) * Math.PI;
      wheelGroup.add(spoke);
    }

    // 4. Pointer Parallax Interaction
    const targetRotation = { x: 0.12, y: -0.15 };
    const currentRotation = { x: 0.12, y: -0.15 };

    const handlePointerMove = (e: PointerEvent) => {
      if (prefersReducedMotion) return;
      const rect = container.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
      targetRotation.y = x * 0.35;
      targetRotation.x = -y * 0.25 + 0.1;
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

    // 6. Animation Loop with Tasteful Light Sweep
    let animationFrameId: number;
    const startTime = performance.now();

    if (prefersReducedMotion) {
      // Set an elegant fixed perspective angle for reduced-motion users
      masterGroup.rotation.set(0.1, -0.15, 0);
      renderer.render(scene, camera);
    } else {
      const animate = () => {
        animationFrameId = requestAnimationFrame(animate);

        const elapsedTime = (performance.now() - startTime) * 0.001;

        // Smooth rotation damping toward pointer parallax
        currentRotation.x += (targetRotation.x - currentRotation.x) * 0.05;
        currentRotation.y += (targetRotation.y - currentRotation.y) * 0.05;

        // Subtle idle rotation & floating bob
        masterGroup.rotation.y = currentRotation.y + Math.sin(elapsedTime * 0.4) * 0.06;
        masterGroup.rotation.x = currentRotation.x + Math.cos(elapsedTime * 0.35) * 0.04;
        masterGroup.position.y = Math.sin(elapsedTime * 0.8) * 0.06;

        // Slow majestic wheel idle rotation
        wheelGroup.rotation.z = elapsedTime * 0.18;

        // Subtle locking bolt tension
        const boltPulse = Math.sin(elapsedTime * 1.5) * 0.015;
        bolts.forEach((bolt, idx) => {
          const angle = (idx / 8) * Math.PI * 2;
          const r = 1.7 + boltPulse;
          bolt.position.set(Math.cos(angle) * r, Math.sin(angle) * r, 0.05);
        });

        // Soft document core glow pulse
        docMat.emissiveIntensity = 0.7 + Math.sin(elapsedTime * 2) * 0.2;

        // Tasteful Unlocking Light Sweep
        const sweepX = Math.sin(elapsedTime * 0.85) * 3.5;
        const sweepY = Math.cos(elapsedTime * 0.85) * 2.0 + 1.0;
        sweepLight.position.set(sweepX, sweepY, 4.5);
        sweepLight.target.position.set(0, 0, 0);

        renderer.render(scene, camera);
      };

      animate();
    }

    // 7. Cleanup
    return () => {
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
      resizeObserver.disconnect();
      container.removeEventListener('pointermove', handlePointerMove);

      if (renderer.domElement && container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
      renderer.dispose();

      // Dispose geometries & materials
      outerFrameGeo.dispose();
      rivetGeo.dispose();
      recessGeo.dispose();
      securityRingGeo.dispose();
      docGeo.dispose();
      docEdgesGeo.dispose();
      doorDiscGeo.dispose();
      innerRingGeo.dispose();
      midRingGeo.dispose();
      boltGeo.dispose();
      hubGeo.dispose();
      hubCapGeo.dispose();
      wheelRimGeo.dispose();
      spokeGeo.dispose();

      gunmetalMat.dispose();
      doorSteelMat.dispose();
      chromeMat.dispose();
      cyanGlowMat.dispose();
      rivetMat.dispose();
      recessMat.dispose();
      docMat.dispose();
      docEdgesMat.dispose();
    };
  }, []);

  if (hasWebGlError) {
    return <VaultFallback />;
  }

  return (
    <div
      ref={containerRef}
      className="relative w-full h-[380px] sm:h-[460px] flex items-center justify-center overflow-hidden rounded-2xl border border-cyan-500/20 bg-slate-950/70 shadow-[0_0_60px_rgba(6,182,212,0.12)] cursor-grab active:cursor-grabbing"
      aria-label="Interactive 3D TrustVault security vault with circular locking wheel and protected document core"
      role="img"
    >
      {/* Background ambient radial highlight */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(6,182,212,0.14)_0%,rgba(139,92,246,0.06)_45%,transparent_70%)] pointer-events-none" />
    </div>
  );
}
