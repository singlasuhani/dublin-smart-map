import { useState, useEffect, useCallback, useMemo } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MapContainer, TileLayer, Marker, Popup, useMap, GeoJSON } from 'react-leaflet';
import L from 'leaflet';
import {
    Search,
    MapPin,
    Building2,
    Trees,
    Info,
    AlertCircle,
    Loader2,
    Navigation,
    ExternalLink,
    Map as MapIcon,
    Book,
    Bath,
    Bike,
    Users,
    Droplets,
    Trash2,
    Recycle,
    Shield,
    Accessibility,
    Waves,
    Church
} from 'lucide-react';
import { useApi } from './hooks/useApi';

// Fix for default marker icons in Leaflet + React
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

let DefaultIcon = L.icon({
    iconUrl: markerIcon,
    iconRetinaUrl: markerIcon2x,
    shadowUrl: markerShadow,
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    tooltipAnchor: [16, -28],
    shadowSize: [41, 41]
});
L.Marker.prototype.options.icon = DefaultIcon;

// Constants
const DUBLIN_CENTER = [53.3498, -6.2603];

// Facility Configuration
const FACILITY_CONFIG = {
    'Park': { icon: Trees, color: '#22c55e' },
    'Library': { icon: Book, color: '#3b82f6' },
    'Toilet': { icon: Bath, color: '#f59e0b' },
    'Bike Parking': { icon: Bike, color: '#9333ea' },
    'Community Centre': { icon: Users, color: '#4f46e5' },
    'Water Fountain': { icon: Droplets, color: '#06b6d4' },
    'Public Bin': { icon: Trash2, color: '#64748b' },
    'Recycling Centre': { icon: Recycle, color: '#0d9488' },
    'Garda Station': { icon: Shield, color: '#1eff00' },
    'Disabled Parking': { icon: Accessibility, color: '#ef4444' },
    'Swimming Pool': { icon: Waves, color: '#0ea5e9' },
    'Place of Worship': { icon: Church, color: '#a855f7' }
};

const getIconForType = (type) => {
    const config = FACILITY_CONFIG[type] || { icon: MapPin, color: '#a855f7' };
    const IconComponent = config.icon;

    const svgString = renderToStaticMarkup(
        <div
            className="custom-marker-wrapper"
            style={{ backgroundColor: config.color }}
        >
            <IconComponent size={18} color="white" strokeWidth={2.5} />
        </div>
    );

    return L.divIcon({
        html: svgString,
        className: 'custom-leaflet-icon',
        iconSize: [32, 32],
        iconAnchor: [16, 32],
        popupAnchor: [0, -32]
    });
};

// Haversine formula to calculate distance between two coordinates in meters
const calculateDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371e3; // Earth's radius in meters
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lon2 - lon1) * Math.PI) / 180;

    const a =
        Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
        Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c; // Distance in meters
};


// Helper to auto-fit map when data changes
function MapViewSetter({ facilities }) {
    const map = useMap();
    useEffect(() => {
        if (facilities && facilities.length > 0) {
            try {
                // Create a temporary GeoJSON layer to calculate bounds for all geometry types (Point, Polygon, etc.)
                const geoJsonLayer = L.geoJSON(facilities);
                const bounds = geoJsonLayer.getBounds();

                if (bounds.isValid()) {
                    map.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 });
                }
            } catch (e) {
                console.warn("Could not set bounds:", e);
            }
        } else {
            map.setView(DUBLIN_CENTER, 12);
        }
    }, [facilities, map]);
    return null;
}

const renderFacilityPopup = (f) => {
    const config = FACILITY_CONFIG[f.properties.type] || { icon: MapPin, color: '#a855f7' };
    const IconComponent = config.icon;

    // Determine coordinates for Google Maps link based on geometry type
    let lat = null, lon = null;
    if (f.geometry.type === 'Point') {
        [lon, lat] = f.geometry.coordinates;
    } else if (f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon') {
        const coords = f.geometry.type === 'Polygon'
            ? f.geometry.coordinates[0][0]
            : f.geometry.coordinates[0][0][0];
        [lon, lat] = coords;
    }

    return (
        <div className="custom-popup-content animate-fade-in">
            <header className="popup-header">
                <h3 className="popup-title">{f.properties.name}</h3>
            </header>

            <div className="flex-column" style={{ gap: 8 }}>
                <div className="popup-info-row">
                    <IconComponent size={14} className="text-accent" />
                    <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{f.properties.type}</span>
                </div>

                <div className="popup-info-row">
                    <Building2 size={14} />
                    <span>{f.properties.area}</span>
                </div>

                {f.properties.address && (
                    <div className="popup-info-row" style={{ alignItems: 'flex-start', marginTop: 4 }}>
                        <Navigation size={14} style={{ flexShrink: 0 }} />
                        <span>{f.properties.address}</span>
                    </div>
                )}
            </div>

            {lat !== null && lon !== null && (
                <div className="popup-footer">
                    <a
                        href={`https://www.google.com/maps/search/?api=1&query=${lat},${lon}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="popup-link"
                    >
                        View on Google Maps <ExternalLink size={12} />
                    </a>
                </div>
            )}
        </div>
    );
};

function App() {
    const { fetchData, loading } = useApi();
    const [showDebug, setShowDebug] = useState(false);
    const [displayedDebugInfo, setDisplayedDebugInfo] = useState(null);

    const [areas, setAreas] = useState([]);
    const [types, setTypes] = useState([]);
    const [facilities, setFacilities] = useState([]);
    const [stats, setStats] = useState(null);
    const [selectedArea, setSelectedArea] = useState('');
    const [selectedTypes, setSelectedTypes] = useState([]);
    const [hasSearched, setHasSearched] = useState(false);

    // Location-based filtering
    const [userLocation, setUserLocation] = useState(null);
    const [nearMeActive, setNearMeActive] = useState(false);
    const [nearMeRadius, setNearMeRadius] = useState(1000); // meters
    const [locationError, setLocationError] = useState(null);



    useEffect(() => {
        const loadInitialData = async () => {
            const [areasData, typesData] = await Promise.all([
                fetchData('/areas'),
                fetchData('/facility-types')
            ]);
            if (areasData) {
                setAreas(areasData);
                if (areasData.debug) setDisplayedDebugInfo(areasData.debug);
            }
            if (typesData) setTypes(typesData);
        };
        loadInitialData();
    }, [fetchData]);

    const handleSearch = useCallback(async () => {
        setHasSearched(true);

        // Fetch facilities
        const data = await fetchData('/facilities', {
            area: selectedArea,
            type: selectedTypes
        });

        if (data) {
            setFacilities(data.features || []);
            if (data.debug) {
                setDisplayedDebugInfo(data.debug);
            }
        }

        // Fetch stats
        const statsData = await fetchData('/stats', {
            area: selectedArea
        });
        if (statsData) setStats(statsData);

    }, [fetchData, selectedArea, selectedTypes]);

    const handleNearMe = useCallback(() => {
        if (!nearMeActive) {
            // Activate Near Me mode
            if (navigator.geolocation) {
                navigator.geolocation.getCurrentPosition(
                    (position) => {
                        setUserLocation({
                            lat: position.coords.latitude,
                            lon: position.coords.longitude
                        });
                        setNearMeActive(true);
                        setLocationError(null);
                    },
                    (error) => {
                        setLocationError('Unable to get your location. Please enable location services.');
                        console.error('Geolocation error:', error);
                    }
                );
            } else {
                setLocationError('Geolocation is not supported by your browser.');
            }
        } else {
            // Deactivate Near Me mode
            setNearMeActive(false);
        }
    }, [nearMeActive]);

    const filteredFacilities = useMemo(() => {
        if (!nearMeActive || !userLocation) {
            return facilities;
        }

        return facilities.filter(facility => {
            // Extract coordinates based on geometry type
            let facLat, facLon;

            if (facility.geometry.type === 'Point') {
                [facLon, facLat] = facility.geometry.coordinates;
            } else if (facility.geometry.type === 'Polygon' || facility.geometry.type === 'MultiPolygon') {
                // For polygons, use the centroid (first coordinate of first ring)
                const coords = facility.geometry.type === 'Polygon'
                    ? facility.geometry.coordinates[0][0]
                    : facility.geometry.coordinates[0][0][0];
                [facLon, facLat] = coords;
            } else {
                return false;
            }

            const distance = calculateDistance(userLocation.lat, userLocation.lon, facLat, facLon);
            return distance <= nearMeRadius;
        });
    }, [nearMeActive, userLocation, facilities, nearMeRadius]);



    return (
        <div className="app-container">
            {/* Sidebar Panel */}
            <aside className="sidebar glass">
                <header className="header" style={{ position: 'relative' }}>
                    <div className="logo-icon">
                        <MapIcon size={28} color="white" />
                    </div>
                    <div className="flex-column" style={{ flex: 1 }}>
                        <h1 className="logo-title">Dublin Core</h1>
                        <span className="logo-subtitle">
                            Knowledge Graph Explorer
                        </span>
                    </div>

                    {displayedDebugInfo && (
                        <div style={{ position: 'relative' }}>
                            <button
                                onClick={() => setShowDebug(!showDebug)}
                                className={`sparql-badge ${showDebug ? 'active' : 'inactive'}`}
                                title="View Technical Details"
                            >
                                <Info size={14} />
                                SPARQL
                            </button>

                            {showDebug && (
                                <div className="animate-fade-in debug-popup">
                                    <div className="debug-popup-header">
                                        <h3>SPARQL Query</h3>
                                        <button
                                            onClick={() => setShowDebug(false)}
                                            className="debug-close-btn"
                                        >
                                            ×
                                        </button>
                                    </div>

                                    <div style={{ marginBottom: 12 }}>
                                        <div className="debug-section-title">DESCRIPTION</div>
                                        <p className="debug-description">{displayedDebugInfo.description}</p>
                                    </div>

                                    <div>
                                        <div className="debug-section-title">QUERY</div>
                                        <pre className="debug-query-container">
                                            {displayedDebugInfo.sparqlQuery}
                                        </pre>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </header>




                <>
                    {/* Filters Card */}
                    <section className="card glass animate-fade-in">
                        <div className="input-group">
                            <label>Committee Area</label>
                            <select
                                value={selectedArea}
                                onChange={(e) => setSelectedArea(e.target.value)}
                                disabled={loading}
                            >
                                <option value="">All Regions</option>
                                {areas.map(area => (
                                    <option key={area.id} value={area.id}>
                                        {area.name}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className="input-group">
                            <label>Facility Types</label>
                            <div className="facility-checklist-container">
                                {types.map(type => (
                                    <label key={type.id} className="facility-checkbox-label">
                                        <input
                                            type="checkbox"
                                            checked={selectedTypes.includes(type.id)}
                                            onChange={(e) => {
                                                const val = type.id;
                                                setSelectedTypes(prev =>
                                                    prev.includes(val)
                                                        ? prev.filter(t => t !== val)
                                                        : [...prev, val]
                                                );
                                            }}
                                            disabled={loading}
                                        />
                                        <span>
                                            {type.name}
                                        </span>
                                    </label>
                                ))}
                                {types.length === 0 && <div className="empty-state-container" style={{ padding: '20px' }}>Loading types...</div>}
                            </div>
                        </div>

                        <button
                            className="primary"
                            onClick={handleSearch}
                            disabled={loading}
                        >
                            {loading ? <Loader2 className="animate-spin" size={20} /> : <Search size={20} />}
                            Explore Dublin
                        </button>

                        <button
                            className={`primary near-me-btn ${nearMeActive ? "active" : ""}`}
                            onClick={handleNearMe}
                            disabled={loading}
                        >
                            <Navigation size={20} />
                            {nearMeActive ? `Showing Near Me (${(nearMeRadius / 1000).toFixed(1)}km)` : 'Near Me'}
                        </button>

                        {nearMeActive && (
                            <div className="radius-control-container animate-fade-in">
                                <div className="radius-label-row">
                                    <label>Search Radius</label>
                                    <span className="radius-value">{(nearMeRadius / 1000).toFixed(1)} km</span>
                                </div>
                                <input
                                    type="range"
                                    min="100"
                                    max="5000"
                                    step="100"
                                    value={nearMeRadius}
                                    onChange={(e) => setNearMeRadius(parseInt(e.target.value))}
                                    className="radius-slider"
                                />
                                <div className="radius-legend">
                                    <span>0.1km</span>
                                    <span>5.0km</span>
                                </div>
                            </div>
                        )}

                        {locationError && (
                            <div className="location-error">
                                <AlertCircle size={16} />
                                <span>{locationError}</span>
                            </div>
                        )}
                    </section>

                    {/* Stats Section */}
                    {stats && (
                        <section className="animate-fade-in">
                            <label className="section-label">
                                Statistics
                            </label>
                            <div className="stats-grid">
                                <div className="stat-card">
                                    <span className="stat-value">{stats.total}</span>
                                    <span className="stat-label">Total Facilities</span>
                                </div>
                                <div className="stat-card">
                                    <span className="stat-value">{stats.byType.length}</span>
                                    <span className="stat-label">Categories</span>
                                </div>
                            </div>
                        </section>
                    )}

                    {/* Results Section */}
                    <section className="results-list">
                        <label className="section-label" style={{ justifyContent: 'space-between' }}>
                            <span>Results</span>
                            <span className="result-count-badge">
                                {facilities.length} found
                            </span>
                        </label>

                        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
                            {facilities.length > 0 ? (
                                facilities.map((f, i) => (
                                    <div
                                        key={i}
                                        className="result-item animate-fade-in"
                                        style={{ animationDelay: `${Math.min(i * 0.05, 1)}s` }}
                                    >
                                        <span className="result-title">{f.properties.name}</span>
                                        <div className="result-sub">
                                            <Trees size={12} /> {f.properties.type}
                                        </div>
                                        <div className="result-sub">
                                            <MapPin size={12} /> {f.properties.area}
                                        </div>
                                    </div>
                                ))
                            ) : hasSearched && !loading ? (
                                <div className="empty-state-container">
                                    <AlertCircle size={40} className="empty-state-icon" />
                                    <h3 className="empty-state-title">No results found</h3>
                                    <p style={{ fontSize: '0.85rem' }}>Try adjusting your filters to find facilities in this area.</p>
                                </div>
                            ) : (
                                <div className="empty-state-container">
                                    <Info size={40} className="empty-state-icon" />
                                    <h3 className="empty-state-title">Start Exploring</h3>
                                    <p style={{ fontSize: '0.85rem' }}>Select a region and facility type to visualize the urban landscape.</p>
                                </div>
                            )}
                        </div>
                    </section>
                </>
            </aside>

            {/* Main Map Content */}
            <main className="map-viewport">
                <MapContainer
                    center={DUBLIN_CENTER}
                    zoom={12}
                    scrollWheelZoom={true}
                    zoomControl={false}
                    style={{ width: '100%', height: '100%' }}
                >
                    {/* Light Mode Map Layer */}
                    <TileLayer
                        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
                        url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
                    />

                    <MapViewSetter facilities={filteredFacilities} />

                    {/* Map Layers */}
                    {filteredFacilities.map((f, i) => {
                        const type = f.properties.type || '';
                        const isPark = type === 'Park';
                        const geom = f.geometry;

                        if (!geom) return null;

                        const isPolygon = geom.type === 'Polygon' || geom.type === 'MultiPolygon';
                        const isPoint = geom.type === 'Point' && Array.isArray(geom.coordinates) && geom.coordinates.length >= 2;

                        const config = FACILITY_CONFIG[type] || { color: '#3388ff' };

                        // Parks: boundary ONLY (no marker)
                        if (isPark) {
                            if (!isPolygon) return null;

                            return (
                                <GeoJSON
                                    key={`${f.properties.uri}-park-${i}`}
                                    data={geom}
                                    style={{
                                        color: config.color,
                                        weight: 2,
                                        opacity: 0.9,
                                        fillColor: config.color,
                                        fillOpacity: 0.2
                                    }}
                                    onEachFeature={(feature, layer) => {
                                        const content = renderToStaticMarkup(renderFacilityPopup(f));
                                        layer.bindPopup(content, { className: 'dcc-popup' });
                                    }}
                                />
                            );
                        }

                        // Non-parks: markers ONLY
                        if (!isPoint) return null;

                        const [lon, lat] = geom.coordinates;

                        return (
                            <Marker
                                key={`${f.properties.uri}-${i}`}
                                position={[lat, lon]}
                                icon={getIconForType(type)}
                            >
                                <Popup>
                                    {renderFacilityPopup(f)}
                                </Popup>
                            </Marker>
                        );
                    })}
                </MapContainer>

                {/* Floating Status Indicator */}
                <div className="status-indicator-container card glass animate-fade-in">
                    <div className="status-indicator-content">
                        <div style={{ position: 'relative' }}>
                            <div className="status-dot"></div>
                            <div className="status-ping"></div>
                        </div>
                        <span className="status-text">
                            GRAPH ENGINE ACTIVE
                        </span>
                    </div>
                </div>
            </main>

        </div>
    );
}

/**
 * Calculate coverage score metrics including Coefficient of Variation
 * @param {Array} distribution - Array of {area, count} objects
 * @returns {Object} Coverage score data with CV, classification, and per-area metrics
 */


export default App;
