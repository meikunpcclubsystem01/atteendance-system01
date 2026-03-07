import React from 'react';

// [カスタマイズ用] ここで自習室のレイアウト（5席×6行）を定義します
// nullは「通路・空間」を意味します
const SEAT_LAYOUT = [
    ["1番", "2番", "3番", "4番", "5番"],
    ["6番", "7番", "8番", "9番", "10番"],
    [null, null, null, null, null], // 通路の例
    ["11番", "12番", "13番", "14番", "15番"],
    ["16番", "17番", "18番", "19番", "20番"],
    [null, null, null, null, null], // 通路の例
    ["21番", "22番", "23番", "24番", "25番"],
    ["26番", "27番", "28番", "29番", "30番"]
];

type SeatMapProps = {
    selectedSeat: string;
    onSelectSeat: (seat: string) => void;
    occupiedSeats: string[];
};

export default function SeatMap({ selectedSeat, onSelectSeat, occupiedSeats }: SeatMapProps) {
    return (
        <div className="w-full max-w-2xl bg-gray-800 p-6 rounded-xl shadow-inner mt-4 overflow-x-auto">
            <div className="flex flex-col gap-4 min-w-[300px]">
                {SEAT_LAYOUT.map((row, rowIndex) => (
                    <div key={`row-${rowIndex}`} className="flex justify-center gap-2 md:gap-4">
                        {row.map((seat, colIndex) => {
                            if (seat === null) {
                                // 通路・空白スペース
                                return <div key={`empty-${rowIndex}-${colIndex}`} className="w-12 h-12 md:w-16 md:h-16" />;
                            }

                            const isOccupied = occupiedSeats.includes(seat);
                            const isSelected = selectedSeat === seat;

                            return (
                                <button
                                    key={seat}
                                    type="button"
                                    disabled={isOccupied}
                                    onClick={() => onSelectSeat(seat)}
                                    className={`
                    w-12 h-12 md:w-16 md:h-16 rounded-lg font-bold text-xs md:text-sm
                    flex flex-col items-center justify-center transition-all duration-200
                    ${isOccupied
                                            ? "bg-red-500 text-white cursor-not-allowed opacity-80" // 使用中（赤）
                                            : isSelected
                                                ? "bg-blue-500 text-white ring-4 ring-blue-300 transform scale-105" // 選択中（青＋ハイライト）
                                                : "bg-gray-200 text-gray-800 hover:bg-gray-300" // 空席（グレー）
                                        }
                  `}
                                >
                                    <span>{seat.replace('番', '')}</span>
                                    <span className="text-[10px] md:text-xs mt-1">
                                        {isOccupied ? "利用中" : isSelected ? "選択中" : "空席"}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                ))}
            </div>

            {/* 凡例（Legend） */}
            <div className="mt-6 flex justify-center gap-6 text-sm text-gray-300">
                <div className="flex items-center gap-2">
                    <div className="w-4 h-4 bg-gray-200 rounded"></div>
                    <span>空席</span>
                </div>
                <div className="flex items-center gap-2">
                    <div className="w-4 h-4 bg-blue-500 rounded"></div>
                    <span>選択中</span>
                </div>
                <div className="flex items-center gap-2">
                    <div className="w-4 h-4 bg-red-500 rounded"></div>
                    <span>利用中</span>
                </div>
            </div>
        </div>
    );
}
