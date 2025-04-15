import { RoomSpec } from '../types';

export interface DesignItem {
  object: string;
  start: [number, number];
  end: [number, number];
  item_id: string;
}

export interface RoomDesign {
  items: DesignItem[];
  wallColor: string;
  style?: 'minimal' | 'mid-century' | 'modern';
}

export const API_URL = 'http://127.0.0.1:5000';

export async function generateRoomDesign(roomSpec: RoomSpec): Promise<RoomDesign> {
  try {
    const response = await fetch(`${API_URL}/generate-design`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(roomSpec),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      console.error("errorData: ", errorData);
      throw new Error(errorData?.error || 'Failed to generate room design');
    }

    const design = await response.json();
    design.style = roomSpec.style;
    console.log("generated design: ", design);
    return design;
  } catch (error) {
    console.error('Error generating room design:', error);
    throw error;
  }
} 