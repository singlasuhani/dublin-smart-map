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
  BarChart3,
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
  Church,
  Landmark
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
    <div style={{
      backgroundColor: config.color,
      width: '32px',
      height: '32px',
      borderRadius: '50%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      border: '2px solid white',
      boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)'
    }}>
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

function App() {
  const { fetchData, loading } = useApi();

  // State
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
  const [locationError, setLocationError] = useState(null);

  // New State for Insights
  const [activeTab, setActiveTab] = useState('explorer'); // 'explorer' or 'insights'
  const [insightType, setInsightType] = useState('park');
  const [missingData, setMissingData] = useState(null);
  const [distributionData, setDistributionData] = useState(null);

  // Initial Load: Areas and Types
  useEffect(() => {
    const loadInitialData = async () => {
      const [areasData, typesData] = await Promise.all([
        fetchData('/areas'),
        fetchData('/facility-types')
      ]);
      if (areasData) setAreas(areasData);
      if (typesData) setTypes(typesData);
    };
    loadInitialData();
  }, [fetchData]);

  // Search Handler
  const handleSearch = useCallback(async () => {
    setHasSearched(true);

    // Fetch facilities
    const data = await fetchData('/facilities', {
      area: selectedArea,
      type: selectedTypes
    });

    if (data) {
      setFacilities(data.features || []);
    }

    // Fetch stats
    const statsData = await fetchData('/stats', {
      area: selectedArea
    });
    if (statsData) setStats(statsData);

  }, [fetchData, selectedArea, selectedTypes]);

  // Handle "Near Me" functionality
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

  // Filter facilities by distance when Near Me is active
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
      return distance <= 1000; // 1km radius
    });
  }, [nearMeActive, userLocation, facilities]);

  // Insight Handler
  const loadInsights = useCallback(async () => {
    const [missing, distribution] = await Promise.all([
      fetchData('/insights/missing', { type: insightType }),
      fetchData('/insights/distribution', { type: insightType })
    ]);
    if (missing) setMissingData(missing);
    if (distribution) setDistributionData(distribution);
  }, [fetchData, insightType]);

  useEffect(() => {
    if (activeTab === 'insights') {
      loadInsights();
    }
  }, [activeTab, insightType, loadInsights]);

  return (
    <div className="app-container">
      {/* Sidebar Panel */}
      <aside className="sidebar glass">
        <header className="header">
          <div className="logo-icon">
            <MapIcon size={28} color="white" />
          </div>
          <div className="flex-column">
            <h1 className="m-0" style={{ fontSize: '1.4rem', fontWeight: 700 }}>Dublin Core</h1>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
              Knowledge Graph Explorer
            </span>
          </div>
        </header>

        {/* Tab Switcher */}
        <div style={{ display: 'flex', background: 'rgba(255,255,255,0.05)', borderRadius: '12px', padding: '4px' }}>
          <button
            style={{
              flex: 1, padding: '8px', border: 'none', borderRadius: '8px', cursor: 'pointer',
              background: activeTab === 'explorer' ? 'var(--accent-color)' : 'transparent',
              color: activeTab === 'explorer' ? 'white' : 'var(--text-secondary)',
              transition: 'var(--transition)', fontWeight: 600, fontSize: '0.8rem'
            }}
            onClick={() => setActiveTab('explorer')}
          >
            Explorer
          </button>
          <button
            style={{
              flex: 1, padding: '8px', border: 'none', borderRadius: '8px', cursor: 'pointer',
              background: activeTab === 'insights' ? 'var(--accent-color)' : 'transparent',
              color: activeTab === 'insights' ? 'white' : 'var(--text-secondary)',
              transition: 'var(--transition)', fontWeight: 600, fontSize: '0.8rem'
            }}
            onClick={() => setActiveTab('insights')}
          >
            Smart Insights
          </button>
        </div>

        {activeTab === 'explorer' ? (
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
                      {area.name} ({area.facilityCount})
                    </option>
                  ))}
                </select>
              </div>

              <div className="input-group">
                <label>Facility Types</label>
                <div style={{
                  maxHeight: '200px',
                  overflowY: 'auto',
                  padding: '12px',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '8px',
                  background: 'rgba(0,0,0,0.2)'
                }}>
                  {types.map(type => (
                    <label key={type.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px', cursor: 'pointer', fontSize: '0.9rem' }}>
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
                        style={{ accentColor: 'var(--accent-color)', width: '16px', height: '16px' }}
                      />
                      <span>{type.name} <span style={{ opacity: 0.5, fontSize: '0.8em' }}>({type.facilityCount})</span></span>
                    </label>
                  ))}
                  {types.length === 0 && <div style={{ opacity: 0.5, fontStyle: 'italic' }}>Loading types...</div>}
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
                className={nearMeActive ? "primary" : "secondary"}
                onClick={handleNearMe}
                disabled={loading}
                style={{
                  marginTop: '8px',
                  background: nearMeActive ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)' : undefined
                }}
              >
                <Navigation size={20} />
                {nearMeActive ? 'Showing Near Me (1km)' : 'Near Me'}
              </button>

              {locationError && (
                <div style={{
                  marginTop: '12px',
                  padding: '12px',
                  background: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  borderRadius: '8px',
                  color: '#fca5a5',
                  fontSize: '0.85rem',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '8px'
                }}>
                  <AlertCircle size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
                  <span>{locationError}</span>
                </div>
              )}
            </section>

            {/* Stats Section */}
            {stats && (
              <section className="animate-fade-in">
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <BarChart3 size={16} /> Area Insights
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
              <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <span>Results</span>
                <span style={{ background: 'var(--accent-glow)', color: 'var(--accent-color)', padding: '2px 8px', borderRadius: '12px', fontSize: '0.7rem' }}>
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
                  <div style={{ padding: '60px 20px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                    <AlertCircle size={40} style={{ marginBottom: 16, opacity: 0.3 }} />
                    <h3 style={{ fontSize: '1.1rem', marginBottom: 8, color: 'var(--text-primary)' }}>No results found</h3>
                    <p style={{ fontSize: '0.85rem' }}>Try adjusting your filters to find facilities in this area.</p>
                  </div>
                ) : (
                  <div style={{ padding: '60px 20px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                    <Info size={40} style={{ marginBottom: 16, opacity: 0.3 }} />
                    <h3 style={{ fontSize: '1.1rem', marginBottom: 8, color: 'var(--text-primary)' }}>Start Exploring</h3>
                    <p style={{ fontSize: '0.85rem' }}>Select a region and facility type to visualize the urban landscape.</p>
                  </div>
                )}
              </div>
            </section>
          </>
        ) : (
          <section className="flex-column animate-fade-in" style={{ gap: 20, flex: 1, overflowY: 'auto' }}>
            {/* Insight Selector */}
            <div className="card glass">
              <label>Select Insight Target</label>
              <select
                value={insightType}
                onChange={(e) => setInsightType(e.target.value)}
              >
                {types.map(type => (
                  <option key={type.id} value={type.id}>{type.name}</option>
                ))}
              </select>
            </div>

            {/* Insight: Missing Facilities */}
            {missingData && (
              <div className="card glass">
                <label style={{ color: '#ef4444' }}>Critical Gaps</label>
                <h3 style={{ margin: 0, fontSize: '1rem' }}>Areas with NO {types.find(t => t.id === insightType)?.name}s</h3>
                <div className="flex-column" style={{ gap: 8, marginTop: 12 }}>
                  {missingData.missingIn.length > 0 ? missingData.missingIn.map(area => (
                    <div key={area.id} className="result-item" style={{ borderColor: 'rgba(239, 68, 68, 0.2)' }}>
                      <span className="result-title" style={{ color: '#ef4444' }}>{area.name}</span>
                    </div>
                  )) : (
                    <p style={{ fontSize: '0.85rem', opacity: 0.7 }}>All areas have at least one {insightType}.</p>
                  )}
                </div>
              </div>
            )}

            {/* Insight: Distribution / Lowest Access */}
            {distributionData && (distributionData.distribution.length > 0) && (
              <div className="card glass">
                <label style={{ color: 'var(--accent-color)' }}>Area Access Levels</label>
                <h3 style={{ margin: 0, fontSize: '1rem' }}>Top 3 Areas with Lowest {types.find(t => t.id === insightType)?.name} count</h3>
                <div className="flex-column" style={{ gap: 8, marginTop: 12 }}>
                  {distributionData.distribution.slice(0, 3).map((item, i) => (
                    <div key={i} className="result-item">
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span className="result-title">{item.area}</span>
                        <span className="stat-value" style={{ fontSize: '1rem' }}>{item.count}</span>
                      </div>
                    </div>
                  ))}
                </div>

                <div style={{ marginTop: 20 }}>
                  <label>Full Distribution</label>
                  <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 10, fontSize: '0.85rem' }}>
                    <thead>
                      <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border-color)' }}>
                        <th style={{ padding: '8px 0', color: 'var(--text-secondary)' }}>AREA</th>
                        <th style={{ padding: '8px 0', textAlign: 'right', color: 'var(--text-secondary)' }}>COUNT</th>
                      </tr>
                    </thead>
                    <tbody>
                      {distributionData.distribution.map((item, i) => (
                        <tr key={i} style={{ borderBottom: '1px dotted var(--border-color)' }}>
                          <td style={{ padding: '10px 0' }}>{item.area}</td>
                          <td style={{ padding: '10px 0', textAlign: 'right', fontWeight: 700 }}>{item.count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {loading && (
              <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
                <Loader2 className="animate-spin" size={32} />
              </div>
            )}
          </section>
        )}
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

          {/* Markers */}
          {filteredFacilities.map((f, i) => {
            const isPolygon = f.geometry && (f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon');
            const config = FACILITY_CONFIG[f.properties.type] || { color: '#3388ff' };

            if (isPolygon) {
              return (
                <GeoJSON
                  key={`${f.properties.uri}-poly-${i}`}
                  data={f.geometry}
                  style={{
                    color: config.color,
                    weight: 2,
                    opacity: 0.8,
                    fillColor: config.color,
                    fillOpacity: 0.2
                  }}
                  onEachFeature={(feature, layer) => {
                    const content = renderToStaticMarkup(
                      <div className="p-2">
                        <h3 style={{ margin: '0 0 5px 0', fontSize: '1rem' }}>{f.properties.name}</h3>
                        <div style={{ fontSize: '0.85rem', color: '#666' }}>{f.properties.type}</div>
                      </div>
                    );
                    layer.bindPopup(content);
                  }}
                />
              );
            }

            // Marker fallback
            if (!f.geometry.coordinates || f.geometry.coordinates.length < 2) return null;

            return (
              <Marker
                key={`${f.properties.uri}-${i}`}
                position={[f.geometry.coordinates[1], f.geometry.coordinates[0]]}
                icon={getIconForType(f.properties.type)}
              >
                <Popup>
                  <div style={{ padding: '16px', minWidth: '220px' }} className="animate-fade-in">
                    <header style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
                      <h3 style={{ margin: 0, fontSize: '1rem', color: 'white', lineHeight: 1.2 }}>{f.properties.name}</h3>
                    </header>

                    <div className="flex-column" style={{ gap: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                        <Trees size={14} className="text-accent" />
                        <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{f.properties.type}</span>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                        <Building2 size={14} />
                        <span>{f.properties.area}</span>
                      </div>

                      {f.properties.address && (
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: 4 }}>
                          <Navigation size={14} style={{ flexShrink: 0 }} />
                          <span>{f.properties.address}</span>
                        </div>
                      )}
                    </div>

                    <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--border-color)', display: 'flex', gap: 8 }}>
                      <a
                        href={`https://www.google.com/maps/search/?api=1&query=${f.geometry.coordinates[1]},${f.geometry.coordinates[0]}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4,
                          fontSize: '0.75rem',
                          color: 'var(--accent-color)',
                          textDecoration: 'none',
                          fontWeight: 600
                        }}
                      >
                        View on Google Maps <ExternalLink size={12} />
                      </a>
                    </div>
                  </div>
                </Popup>
              </Marker>
            )
          })}
        </MapContainer>

        {/* Floating Status Indicator */}
        <div style={{ position: 'absolute', top: 20, right: 20, zIndex: 1000 }} className="glass card animate-fade-in">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ position: 'relative' }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--accent-color)' }}></div>
              <div className="ping" style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: 10,
                height: 10,
                borderRadius: '50%',
                background: 'var(--accent-color)',
                opacity: 0.7,
                animation: 'ping 2s cubic-bezier(0, 0, 0.2, 1) infinite'
              }}></div>
            </div>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.05em', color: 'var(--text-primary)' }}>
              GRAPH ENGINE ACTIVE
            </span>
          </div>
        </div>
      </main>

      <style>{`
        @keyframes ping {
          75%, 100% {
            transform: scale(2.5);
            opacity: 0;
          }
        }
        .text-accent { color: var(--accent-color); }
      `}</style>
    </div>
  );
}

export default App;
