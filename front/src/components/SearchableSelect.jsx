import React, { useState, useEffect, useRef } from 'react';
import { Search, ChevronDown, X } from 'lucide-react';

const SearchableSelect = ({ 
  options = [], 
  value, 
  onChange, 
  placeholder = "Seleccionar...", 
  labelKey = "label", 
  valueKey = "value",
  secondaryKey = null,
  disabled = false,
  className = "",
  onSearch = null,
  loading = false
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const wrapperRef = useRef(null);
  const searchTimeoutRef = useRef(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Handle search with debounce
  useEffect(() => {
    if (onSearch) {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
      searchTimeoutRef.current = setTimeout(() => {
        onSearch(searchTerm);
      }, 500);
    }
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [searchTerm, onSearch]);

  // Find selected item
  const selectedItem = options.find(opt => opt[valueKey] == value);

  // Filter options
  const filteredOptions = onSearch ? options : options.filter(opt => {
    const label = String(opt[labelKey] || '').toLowerCase();
    const secondary = secondaryKey ? String(opt[secondaryKey] || '').toLowerCase() : '';
    const search = searchTerm.toLowerCase();
    return label.includes(search) || secondary.includes(search);
  });

  const handleSelect = (item) => {
    onChange(item);
    setIsOpen(false);
    setSearchTerm('');
  };

  const clearSelection = (e) => {
    e.stopPropagation();
    onChange(null);
    setSearchTerm('');
  };

  return (
    <div className={`relative ${className}`} ref={wrapperRef}>
      <div 
        className={`
          w-full border rounded-md shadow-sm p-2 flex items-center justify-between bg-white cursor-pointer
          ${disabled ? 'bg-gray-100 cursor-not-allowed' : 'hover:border-blue-400'}
          ${isOpen ? 'ring-2 ring-blue-500 border-transparent' : 'border-gray-300'}
        `}
        onClick={() => !disabled && setIsOpen(!isOpen)}
      >
        <div className="flex-1 truncate text-sm">
          {selectedItem ? (
            <span className="text-gray-900">
              {selectedItem[labelKey]}
              {secondaryKey && <span className="text-gray-500 ml-2 text-xs">({selectedItem[secondaryKey]})</span>}
            </span>
          ) : (
            <span className="text-gray-400">{placeholder}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {selectedItem && !disabled && (
            <div 
              onClick={clearSelection}
              className="p-1 hover:bg-gray-100 rounded-full text-gray-400 hover:text-red-500"
            >
              <X size={14} />
            </div>
          )}
          <ChevronDown size={16} className={`text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </div>
      </div>

      {isOpen && !disabled && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-60 overflow-auto">
          <div className="p-2 sticky top-0 bg-white border-b border-gray-100">
            <div className="relative">
              <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                className="w-full pl-8 pr-2 py-1 text-sm border border-gray-200 rounded focus:outline-none focus:border-blue-500"
                placeholder="Buscar..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onClick={(e) => e.stopPropagation()}
                autoFocus
              />
            </div>
          </div>
          
          <div className="py-1">
            {loading ? (
              <div className="px-3 py-4 text-center text-sm text-gray-500">
                Buscando...
              </div>
            ) : filteredOptions.length > 0 ? (
              filteredOptions.map((opt) => (
                <div
                  key={opt[valueKey]}
                  onClick={() => handleSelect(opt)}
                  className={`
                    px-3 py-2 text-sm cursor-pointer hover:bg-blue-50
                    ${opt[valueKey] == value ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-700'}
                  `}
                >
                  <div className="flex flex-col">
                    <span>{opt[labelKey]}</span>
                    {secondaryKey && (
                      <span className="text-xs text-gray-500">{opt[secondaryKey]}</span>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <div className="px-3 py-4 text-center text-sm text-gray-500">
                No se encontraron resultados
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default SearchableSelect;
