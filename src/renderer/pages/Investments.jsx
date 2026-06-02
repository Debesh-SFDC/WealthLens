export default function Investments() {
  return (
    <div className="p-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Investments</h2>
          <p className="mt-1 text-sm text-gray-500">MF, EPF, NPS, Stocks, FD, Gold & more</p>
        </div>
        <button
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-white text-sm font-semibold transition-opacity hover:opacity-90"
          style={{ backgroundColor: '#6C63FF' }}
        >
          <span className="text-lg leading-none">+</span>
          Add Investment
        </button>
      </div>

      <div className="flex items-center justify-center h-64 rounded-2xl bg-white border border-dashed border-gray-200">
        <div className="text-center">
          <p className="text-4xl mb-3">📈</p>
          <p className="text-base font-semibold text-gray-700">No investments recorded</p>
          <p className="text-sm text-gray-400 mt-1">Start tracking your portfolio by adding an investment</p>
        </div>
      </div>
    </div>
  )
}
