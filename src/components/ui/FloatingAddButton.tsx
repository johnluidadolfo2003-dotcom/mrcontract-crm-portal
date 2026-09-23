import React from 'react';
import { Plus } from 'lucide-react';

interface FloatingAddButtonProps {
 onClick: () => void;
}

export const FloatingAddButton: React.FC<FloatingAddButtonProps> = ({ onClick }) => {
 return (
 <button
 onClick={onClick}
 className="fixed bottom-6 right-6 w-14 h-14 bg-[#EF7E15] hover:bg-[#D66B0F] text-white rounded-lg flex items-center justify-center shadow-sm transition-all z-50 group border border-brand-orange/50"
 title="Add New Lead"
 >
 <Plus className="w-6 h-6 transition-transform"/>
 </button>
 );
};
