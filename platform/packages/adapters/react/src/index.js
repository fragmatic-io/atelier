'use client';
import React from 'react';
import { createAtelierReact } from './factory.mjs';
export const {
  AtelierProvider,
  AtelierSlot,
  AtelierRoute,
  AtelierDrawerSlot,
  AtelierModalSlot,
  useAtelier,
} = createAtelierReact(React);
