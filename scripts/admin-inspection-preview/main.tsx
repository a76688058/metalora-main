import { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { AdminOrderItem } from '../../src/components/admin/adminOrders';
import { ProductionInspectionViewer } from '../../src/components/admin/ProductionInspectionViewer';
import { sharedRasterFrames, type ManufacturingFileResult } from '../../src/components/admin/productionInspection';
import type { CustomComposition, CustomSource } from '../../src/lib/customComposition/types';
import './preview.css';

const source: CustomSource = { url: '', width: 1152, height: 363 };
const purchased: CustomComposition = { version: 1, orientation: 'portrait', zoom: 1, offsetX: 0, offsetY: 0 };

function paintOriginal(context: CanvasRenderingContext2D, frames: ReturnType<typeof sharedRasterFrames>) {
  const gradient = context.createLinearGradient(0, 0, source.width, 0);
  gradient.addColorStop(0, '#1e3a8a');
  gradient.addColorStop(0.42, '#38bdf8');
  gradient.addColorStop(0.5, '#f8fafc');
  gradient.addColorStop(0.58, '#fb7185');
  gradient.addColorStop(1, '#881337');
  context.fillStyle = gradient;
  context.fillRect(0, 0, source.width, source.height);
  context.fillStyle = '#0f172a';
  context.font = '64px sans-serif';
  context.fillText('LEFT', 36, 200);
  context.fillText('RIGHT', 900, 200);
  const window = frames.sourceWindow;
  const centerX = window.x + window.width / 2;
  const centerY = window.y + window.height / 2;
  context.fillStyle = '#6d28d9';
  context.beginPath();
  context.arc(centerX, centerY, 70, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = '#fef3c7';
  context.fillRect(window.x - 18, centerY - 8, window.width + 36, 16);
  context.fillStyle = '#fff';
  context.font = '28px sans-serif';
  context.textAlign = 'center';
  context.fillText('BUY', centerX, centerY + 8);
  context.textAlign = 'start';
}

function drawPlaced(
  original: HTMLCanvasElement,
  frame: { width: number; height: number; drawX: number; drawY: number; drawWidth: number; drawHeight: number },
): string {
  const canvas = document.createElement('canvas');
  canvas.width = frame.width;
  canvas.height = frame.height;
  const context = canvas.getContext('2d');
  if (!context) return '';
  context.fillStyle = '#f4f4f5';
  context.fillRect(0, 0, frame.width, frame.height);
  context.drawImage(original, frame.drawX, frame.drawY, frame.drawWidth, frame.drawHeight);
  return canvas.toDataURL('image/png');
}

function buildFixture() {
  const frames = sharedRasterFrames(source, purchased);
  const original = document.createElement('canvas');
  original.width = source.width;
  original.height = source.height;
  const context = original.getContext('2d');
  if (!context) throw new Error('canvas');
  paintOriginal(context, frames);
  return {
    originalUrl: original.toDataURL('image/png'),
    previewUrl: drawPlaced(original, frames.preview),
    manufacturingUrl: drawPlaced(original, frames.manufacturing),
    manufacturingWidth: frames.manufacturing.width,
    manufacturingHeight: frames.manufacturing.height,
  };
}

const item: AdminOrderItem = {
  title: '합성 커스텀',
  option: 'M',
  quantity: 1,
  price: 100,
  imageUrl: 'previews/fixture/fixture.jpg',
  orientation: 'portrait',
  isWorkshop: true,
  originalRef: 'originals/fixture/fixture.png',
  lineId: null,
  customConfig: {
    source_width: 1152,
    source_height: 363,
    output_width_mm: 200,
    output_height_mm: 283,
    original_image_url: 'originals/fixture/fixture.png',
    preview_image_url: 'previews/fixture/fixture.jpg',
    composition: { version: 1, orientation: 'portrait', zoom: 1, offsetX: 0, offsetY: 0 },
  },
};

function PreviewApp() {
  const fixture = useMemo(() => buildFixture(), []);
  const [light, setLight] = useState(false);
  const requestManufacturing = (): Promise<ManufacturingFileResult> => new Promise((resolve) => {
    window.setTimeout(() => resolve({
      ok: true,
      src: fixture.manufacturingUrl,
      width: fixture.manufacturingWidth,
      height: fixture.manufacturingHeight,
      bytes: 1200,
      belowReference: true,
      resampled: true,
    }), 450);
  });
  return (
    <div className={light ? 'min-h-screen bg-zinc-100 text-zinc-900' : 'min-h-screen bg-zinc-950 text-white'}>
      <div className="flex items-center justify-between px-4 py-2">
        <p className="text-xs text-zinc-500">같은 원본과 구매 구도에서 만든 합성 화면입니다. 실주문 이미지가 아닙니다.</p>
        <button type="button" className="min-h-11 rounded-lg px-3 text-sm" onClick={() => setLight((value) => !value)}>
          {light ? '어두운 배경' : '밝은 배경'}
        </button>
      </div>
      <ProductionInspectionViewer
        item={item}
        orderNumber="FIXTURE-PORTRAIT-M"
        itemIndex={0}
        preview={{ status: 'ready', src: fixture.previewUrl }}
        original={{ status: 'ready', src: fixture.originalUrl }}
        onRequestManufacturing={requestManufacturing}
        onClose={() => undefined}
      />
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<PreviewApp />);
