import BookingCard from "./components/BookingCard";
import VehicleDispatchBoardMock from "./components/VehicleDispatchBoardMock";

function App() {
  return (
    <div className="min-h-screen bg-slate-50 p-6 space-y-4">
      <h1 className="text-2xl font-semibold">Vehicle Dispatch Board (mock)</h1>
      <BookingCard />
      <VehicleDispatchBoardMock />
    </div>
  );
}
export default App;
