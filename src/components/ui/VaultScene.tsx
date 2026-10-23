'use client';

import dynamic from 'next/dynamic';
import VaultFallback from './VaultFallback';

const VaultCanvas = dynamic(() => import('./VaultCanvas'), {
  ssr: false,
  loading: () => <VaultFallback />,
});

export default function VaultScene() {
  return <VaultCanvas />;
}
