import { useState, useCallback } from 'react'
import './App.css'
import RoomVisualizer from './components/RoomVisualizer'
import RoomControls from './components/RoomControls'
import { DoorWindow, RoomSpec } from './types'
import { generateRoomDesign, RoomDesign } from './services/designService'

// Define the result type
interface Result {
  success: boolean;
  message: string;
}

function App() {
  const [roomLength, setRoomLength] = useState(16) // ~5m in feet
  const [roomWidth, setRoomWidth] = useState(13)   // ~4m in feet
  const [doors, setDoors] = useState<DoorWindow[]>([])
  const [windows, setWindows] = useState<DoorWindow[]>([])
  const [description, setDescription] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [result, setResult] = useState<Result | null>(null)
  const [design, setDesign] = useState<RoomDesign | undefined>(undefined)

  const handleAddDoor = (door: DoorWindow) => {
    setDoors([...doors, door])
  }

  const handleAddWindow = (window: DoorWindow) => {
    setWindows([...windows, window])
  }

  const handleRemoveDoor = (index: number) => {
    setDoors(doors.filter((_, i) => i !== index))
  }

  const handleRemoveWindow = (index: number) => {
    setWindows(windows.filter((_, i) => i !== index))
  }

  const handleSubmit = useCallback(async () => {
    // Prepare the data to send to the backend
    const roomSpec: RoomSpec = {
      length: roomLength,
      width: roomWidth,
      doors,
      windows,
      description
    }

    setIsLoading(true)
    setDesign(undefined)
    
    try {
      const generatedDesign = await generateRoomDesign(roomSpec)
      setDesign(generatedDesign)
      setResult({
        success: true,
        message: 'Successfully generated interior design recommendations.'
      })
    } catch (error) {
      console.error('Error generating recommendations:', error)
      setResult({
        success: false,
        message: 'An error occurred while generating recommendations.'
      })
    } finally {
      setIsLoading(false)
    }
  }, [roomLength, roomWidth, doors, windows, description])

  return (
    <div className="app">
      <header>
        <h1>InteriorRec</h1>
        <h2>Interior Design Recommendation</h2>
      </header>
      
      <main>
        <div className="room-designer">
          <div className="visualizer-container">
            <RoomVisualizer 
              roomLength={roomLength} 
              roomWidth={roomWidth} 
              doors={doors} 
              windows={windows}
              design={design}
            />
          </div>
          
          <div className="controls-container">
            <RoomControls
              roomLength={roomLength}
              roomWidth={roomWidth}
              doors={doors}
              windows={windows}
              onRoomLengthChange={setRoomLength}
              onRoomWidthChange={setRoomWidth}
              onAddDoor={handleAddDoor}
              onAddWindow={handleAddWindow}
              onRemoveDoor={handleRemoveDoor}
              onRemoveWindow={handleRemoveWindow}
              onSubmit={handleSubmit}
              description={description}
              onDescriptionChange={setDescription}
            />
          </div>
        </div>
        
        {isLoading && (
          <div className="loading-overlay">
            <div className="spinner"></div>
            <p>Generating recommendations...</p>
          </div>
        )}
        
        {result && (
          <div className={`result-message ${result.success ? 'success' : 'error'}`}>
            <p>{result.message}</p>
          </div>
        )}
      </main>
    </div>
  )
}

export default App
