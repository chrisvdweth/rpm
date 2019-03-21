from geopy.geocoders import Nominatim
from geopy.distance import vincenty

geolocator = Nominatim()


class GeoUtil:

    @staticmethod
    def geocode_location(s):
        loc = geolocator.geocode(s)
        if loc is None:
            return None
        return { 'display_name': loc.raw['display_name'], 'type': loc.raw['type'], 'class': loc.raw['class'], 'lat': loc.raw['lat'], 'lng': loc.raw['lon'], 'bounding_box': loc.raw['boundingbox'] }


    @staticmethod
    def distance_in_meters(coords_1, coords_2):
        return vincenty(coords_1, coords_2).m




#print(GeoUtil.distance_in_meters( (1.328778, 103.764478), (1.329907, 103.879919)))
