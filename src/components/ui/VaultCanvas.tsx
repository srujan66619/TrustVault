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

    // 1. Scene & Perspective Camera
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(
      40,
      container.clientWidth / container.clientHeight,
      0.1,
      1000
    );
    camera.position.set(0, 0, 7.0);

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

    // 2. Cybernetic Vault Lighting System
    const ambientLight = new THREE.AmbientLight(0x0a1022, 3.0);
    scene.add(ambientLight);

    const cyanPointLight = new THREE.PointLight(0x06b6d4, 5.0, 18);
    cyanPointLight.position.set(4, 4.5, 4.5);
    scene.add(cyanPointLight);

    const violetPointLight = new THREE.PointLight(0x8b5cf6, 3.8, 18);
    violetPointLight.position.set(-4, -4, 4);
    scene.add(violetPointLight);

    // Dynamic Sweeping Spotlight for realistic metal surface reflections
    const sweepLight = new THREE.SpotLight(0x38bdf8, 6.0, 16, Math.PI / 3.5, 0.45, 1.2);
    sweepLight.position.set(0, 3.5, 5.5);
    scene.add(sweepLight);
    scene.add(sweepLight.target);

    // 3. Master Vault Assembly Group
    const masterGroup = new THREE.Group();
    scene.add(masterGroup);

    // Materials Palette
    const frameMat = new THREE.MeshStandardMaterial({
      color: 0x0c1322,
      metalness: 0.94,
      roughness: 0.25,
    });

    const doorSteelMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      metalness: 0.88,
      roughness: 0.20,
    });

    const chromeMat = new THREE.MeshStandardMaterial({
      color: 0xf8fafc,
      metalness: 0.98,
      roughness: 0.10,
    });

    const cyanGlowMat = new THREE.MeshStandardMaterial({
      color: 0x22d3ee,
      emissive: 0x06b6d4,
      emissiveIntensity: 3.2,
      roughness: 0.15,
    });

    const rivetMat = new THREE.MeshStandardMaterial({
      color: 0x64748b,
      metalness: 0.92,
      roughness: 0.28,
    });

    // --- A. Heavy Outer Vault Frame (Beveled Bank Vault Flange) ---
    const outerFrameGeo = new THREE.CylinderGeometry(2.65, 2.8, 0.52, 64);
    outerFrameGeo.rotateX(Math.PI / 2);
    const outerFrame = new THREE.Mesh(outerFrameGeo, frameMat);
    masterGroup.add(outerFrame);

    // Perimeter Rim Heavy Bolts (20 bolts around the rim flange)
    const rivetGeo = new THREE.CylinderGeometry(0.05, 0.05, 0.1, 16);
    rivetGeo.rotateX(Math.PI / 2);
    const boltRadius = 2.62;
    for (let i = 0; i < 20; i++) {
      const angle = (i / 20) * Math.PI * 2;
      const rivet = new THREE.Mesh(rivetGeo, rivetMat);
      rivet.position.set(
        Math.cos(angle) * boltRadius,
        Math.sin(angle) * boltRadius,
        0.28
      );
      masterGroup.add(rivet);
    }

    // --- B. Deep Recessed Vault Chamber Cavity ---
    const recessGeo = new THREE.CylinderGeometry(2.32, 2.32, 0.42, 64);
    recessGeo.rotateX(Math.PI / 2);
    const recessMat = new THREE.MeshStandardMaterial({
      color: 0x030712,
      metalness: 0.95,
      roughness: 0.5,
    });
    const recessMesh = new THREE.Mesh(recessGeo, recessMat);
    recessMesh.position.z = -0.06;
    masterGroup.add(recessMesh);

    // Radiant Cyan Light around the door seam
    const seamRingGeo = new THREE.TorusGeometry(2.24, 0.045, 16, 64);
    const seamRing = new THREE.Mesh(seamRingGeo, cyanGlowMat);
    seamRing.position.z = 0.18;
    masterGroup.add(seamRing);

    // --- C. Protected Cryptographic Document Core (Softly illuminated inside) ---
    const docCoreGroup = new THREE.Group();
    docCoreGroup.position.set(0, 0, -0.06);
    masterGroup.add(docCoreGroup);

    const docGeo = new THREE.BoxGeometry(0.95, 1.35, 0.06);
    const docMat = new THREE.MeshStandardMaterial({
      color: 0x1e1b4b,
      emissive: 0x38bdf8,
      emissiveIntensity: 0.85,
      metalness: 0.75,
      roughness: 0.22,
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

    // --- D. Massive Steel Circular Vault Door ---
    const doorGroup = new THREE.Group();
    doorGroup.position.z = 0.1;
    masterGroup.add(doorGroup);

    // Main Heavy Door Disc
    const doorDiscGeo = new THREE.CylinderGeometry(2.05, 2.05, 0.26, 64);
    doorDiscGeo.rotateX(Math.PI / 2);
    const doorDisc = new THREE.Mesh(doorDiscGeo, doorSteelMat);
    doorGroup.add(doorDisc);

    // Concentric Reinforcing Rings
    const outerBevelGeo = new THREE.TorusGeometry(1.65, 0.05, 16, 64);
    const outerBevel = new THREE.Mesh(outerBevelGeo, chromeMat);
    outerBevel.position.z = 0.14;
    doorGroup.add(outerBevel);

    const midBevelGeo = new THREE.TorusGeometry(1.05, 0.035, 16, 48);
    const midBevel = new THREE.Mesh(midBevelGeo, cyanGlowMat);
    midBevel.position.z = 0.14;
    doorGroup.add(midBevel);

    // Radial Locking Bars (8 heavy steel bolts extending into frame seam)
    const boltGeo = new THREE.CylinderGeometry(0.075, 0.075, 0.58, 20);
    boltGeo.rotateZ(Math.PI / 2);
    const bolts: THREE.Mesh[] = [];
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      const bolt = new THREE.Mesh(boltGeo, chromeMat);
      bolt.position.set(
        Math.cos(angle) * 1.95,
        Math.sin(angle) * 1.95,
        0.06
      );
      bolt.rotation.z = angle;
      doorGroup.add(bolt);
      bolts.push(bolt);
    }

    // --- E. Central Bank Vault Hand Wheel Assembly ---
    const wheelGroup = new THREE.Group();
    wheelGroup.position.z = 0.26;
    doorGroup.add(wheelGroup);

    // Wheel Central Hub
    const hubGeo = new THREE.CylinderGeometry(0.38, 0.42, 0.32, 32);
    hubGeo.rotateX(Math.PI / 2);
    const hub = new THREE.Mesh(hubGeo, frameMat);
    wheelGroup.add(hub);

    const hubCapGeo = new THREE.CylinderGeometry(0.22, 0.22, 0.35, 32);
    hubCapGeo.rotateX(Math.PI / 2);
    const hubCap = new THREE.Mesh(hubCapGeo, cyanGlowMat);
    wheelGroup.add(hubCap);

    // Heavy Chrome Hand Wheel Outer Rim
    const wheelRimGeo = new THREE.TorusGeometry(0.78, 0.065, 16, 48);
    const wheelRim = new THREE.Mesh(wheelRimGeo, chromeMat);
    wheelRim.position.z = 0.12;
    wheelGroup.add(wheelRim);

    // Wheel Radial Spokes (6 tubular spokes)
    const spokeGeo = new THREE.CylinderGeometry(0.04, 0.04, 1.56, 16);
    for (let i = 0; i < 3; i++) {
      const spoke = new THREE.Mesh(spokeGeo, chromeMat);
      spoke.position.z = 0.12;
      spoke.rotation.z = (i / 3) * Math.PI;
      wheelGroup.add(spoke);
    }

    // 4. Pointer Parallax Interaction
    const targetRotation = { x: 0.12, y: -0.16 };
    const currentRotation = { x: 0.12, y: -0.16 };

    const handlePointerMove = (e: PointerEvent) => {
      if (prefersReducedMotion) return;
      const rect = container.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
      targetRotation.y = x * 0.38;
      targetRotation.x = -y * 0.28 + 0.12;
    };

    window.addEventListener('pointermove', handlePointerMove);

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

    // 6. Animation Loop with Tasteful Light Reflection
    let animationFrameId: number;
    const startTime = performance.now();

    if (prefersReducedMotion) {
      // Elegant static perspective angle
      masterGroup.rotation.set(0.12, -0.16, 0);
      renderer.render(scene, camera);
    } else {
      const animate = () => {
        animationFrameId = requestAnimationFrame(animate);

        const elapsedTime = (performance.now() - startTime) * 0.001;

        // Smooth rotation damping toward pointer parallax
        currentRotation.x += (targetRotation.x - currentRotation.x) * 0.05;
        currentRotation.y += (targetRotation.y - currentRotation.y) * 0.05;

        // Subtle idle rotation & floating bob
        masterGroup.rotation.y = currentRotation.y + Math.sin(elapsedTime * 0.35) * 0.05;
        masterGroup.rotation.x = currentRotation.x + Math.cos(elapsedTime * 0.3) * 0.035;
        masterGroup.position.y = Math.sin(elapsedTime * 0.7) * 0.06;

        // Slow majestic hand-wheel rotation
        wheelGroup.rotation.z = elapsedTime * 0.14;

        // Locking bolt breathing tension
        const boltPulse = Math.sin(elapsedTime * 1.4) * 0.015;
        bolts.forEach((bolt, idx) => {
          const angle = (idx / 8) * Math.PI * 2;
          const r = 1.95 + boltPulse;
          bolt.position.set(Math.cos(angle) * r, Math.sin(angle) * r, 0.06);
        });

        // Soft document core glow pulse
        docMat.emissiveIntensity = 0.75 + Math.sin(elapsedTime * 1.8) * 0.2;

        // Moving Metallic Light Reflection Sweep
        const sweepX = Math.sin(elapsedTime * 0.75) * 4.0;
        const sweepY = Math.cos(elapsedTime * 0.75) * 2.2 + 1.2;
        sweepLight.position.set(sweepX, sweepY, 5.5);
        sweepLight.target.position.set(0, 0, 0);

        renderer.render(scene, camera);
      };

      animate();
    }

    // 7. Cleanup
    return () => {
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
      resizeObserver.disconnect();
      window.removeEventListener('pointermove', handlePointerMove);

      if (renderer.domElement && container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
      renderer.dispose();

      // Geometries
      outerFrameGeo.dispose();
      rivetGeo.dispose();
      recessGeo.dispose();
      seamRingGeo.dispose();
      docGeo.dispose();
      docEdgesGeo.dispose();
      doorDiscGeo.dispose();
      outerBevelGeo.dispose();
      midBevelGeo.dispose();
      boltGeo.dispose();
      hubGeo.dispose();
      hubCapGeo.dispose();
      wheelRimGeo.dispose();
      spokeGeo.dispose();

      // Materials
      frameMat.dispose();
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
      className="relative w-full h-[380px] sm:h-[460px] lg:h-[520px] flex items-center justify-center cursor-grab active:cursor-grabbing select-none"
      aria-label="Interactive 3D TrustVault bank vault door with circular locking wheel"
      role="img"
    >
      {/* Soft natural radial bloom blending seamlessly into the dark background without any box frame */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(6,182,212,0.14)_0%,rgba(124,58,237,0.06)_40%,transparent_70%)] pointer-events-none" />
    </div>
  );
}
