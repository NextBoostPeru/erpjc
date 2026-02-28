import React, { useState, useEffect, useRef } from 'react';
import { Bell, Check, X, Info, AlertTriangle, CheckCircle, AlertOctagon, Trash2 } from 'lucide-react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { API_URL } from '../api/config';
import toast from 'react-hot-toast';

const Notifications = () => {
    const [notifications, setNotifications] = useState([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [isOpen, setIsOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const dropdownRef = useRef(null);
    const navigate = useNavigate();

    const fetchNotifications = async () => {
        try {
            const token = localStorage.getItem('token');
            if (!token) return;

            const response = await axios.get(`${API_URL}notificaciones.php`, {
                headers: { Authorization: `Bearer ${token}` }
            });

            if (response.data.success) {
                setNotifications(response.data.data);
                setUnreadCount(response.data.unread_count);
            }
        } catch (error) {
            console.error("Error fetching notifications:", error);
        }
    };

    useEffect(() => {
        fetchNotifications();
        
        // Poll every 10 minutes to save database connections, and only if visible
        const interval = setInterval(() => {
            if (document.visibilityState === 'visible') {
                fetchNotifications();
            }
        }, 600000);
        
        return () => clearInterval(interval);
    }, []);

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const markAsRead = async (id, link) => {
        try {
            const token = localStorage.getItem('token');
            await axios.put(`${API_URL}notificaciones.php`, 
                { id }, 
                { headers: { Authorization: `Bearer ${token}` } }
            );
            
            // Update local state
            setNotifications(prev => prev.map(n => 
                n.id === id ? { ...n, leido: 1 } : n
            ));
            setUnreadCount(prev => Math.max(0, prev - 1));

            if (link) {
                setIsOpen(false);
                navigate(link);
            }
        } catch (error) {
            console.error("Error marking as read:", error);
        }
    };

    const markAllAsRead = async () => {
        try {
            const token = localStorage.getItem('token');
            await axios.put(`${API_URL}notificaciones.php`, 
                { mark_all: true }, 
                { headers: { Authorization: `Bearer ${token}` } }
            );
            
            setNotifications(prev => prev.map(n => ({ ...n, leido: 1 })));
            setUnreadCount(0);
            toast.success('Todas marcadas como leídas');
        } catch (error) {
            console.error("Error marking all as read:", error);
        }
    };

    const getIcon = (type) => {
        switch (type) {
            case 'warning': return <AlertTriangle size={18} className="text-amber-500" />;
            case 'success': return <CheckCircle size={18} className="text-green-500" />;
            case 'error': return <AlertOctagon size={18} className="text-red-500" />;
            default: return <Info size={18} className="text-blue-500" />;
        }
    };

    return (
        <div className="relative" ref={dropdownRef}>
            <button 
                onClick={() => setIsOpen(!isOpen)}
                className="relative p-2 text-gray-500 hover:bg-gray-100 rounded-full transition-colors focus:outline-none"
            >
                <Bell size={20} />
                {unreadCount > 0 && (
                    <span className="absolute top-0 right-0 inline-flex items-center justify-center px-1.5 py-0.5 text-xs font-bold leading-none text-white transform translate-x-1/4 -translate-y-1/4 bg-red-500 rounded-full">
                        {unreadCount > 99 ? '99+' : unreadCount}
                    </span>
                )}
            </button>

            {isOpen && (
                <div className="absolute right-0 mt-2 w-[calc(100vw-2rem)] sm:w-80 md:w-96 bg-white rounded-xl shadow-lg border border-gray-200 z-50 overflow-hidden ring-1 ring-black ring-opacity-5">
                    <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                        <h3 className="font-semibold text-gray-900">Notificaciones</h3>
                        {unreadCount > 0 && (
                            <button 
                                onClick={markAllAsRead}
                                className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                            >
                                Marcar todo leído
                            </button>
                        )}
                    </div>

                    <div className="max-h-[400px] overflow-y-auto">
                        {notifications.length === 0 ? (
                            <div className="p-8 text-center text-gray-500">
                                <Bell size={32} className="mx-auto mb-2 opacity-20" />
                                <p className="text-sm">No tienes notificaciones</p>
                            </div>
                        ) : (
                            <div className="divide-y divide-gray-100">
                                {notifications.map((notification) => (
                                    <div 
                                        key={notification.id}
                                        onClick={() => markAsRead(notification.id, notification.enlace)}
                                        className={`p-4 hover:bg-gray-50 transition-colors cursor-pointer flex gap-3 ${!notification.leido ? 'bg-blue-50/50' : ''}`}
                                    >
                                        <div className="mt-1 flex-shrink-0">
                                            {getIcon(notification.tipo)}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className={`text-sm ${!notification.leido ? 'font-semibold text-gray-900' : 'text-gray-700'}`}>
                                                {notification.titulo}
                                            </p>
                                            <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">
                                                {notification.mensaje}
                                            </p>
                                            <p className="text-[10px] text-gray-400 mt-1">
                                                {new Date(notification.created_at).toLocaleString()}
                                            </p>
                                        </div>
                                        {!notification.leido && (
                                            <div className="flex-shrink-0 self-center">
                                                <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default Notifications;
