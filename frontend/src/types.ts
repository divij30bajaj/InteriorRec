export interface DoorWindow {
  wall: 'north' | 'east' | 'south' | 'west';
  position: number; // 0-1 position along the wall
  width: number;
  height: number;
}

export interface RoomSpec {
  length: number;
  width: number;
  doors: DoorWindow[];
  windows: DoorWindow[];
  description: string;
} 