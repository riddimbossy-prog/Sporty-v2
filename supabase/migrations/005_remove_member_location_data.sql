-- sporty.codes v20.3.3
-- Remove previously stored optional browser-location values.
-- The application no longer requests browser geolocation.

begin;

update public.user_presence
set approx_lat = null,
    approx_lng = null,
    location_permission = 'not_requested',
    updated_at = now();

update public.user_signins
set approx_lat = null,
    approx_lng = null,
    location_permission = 'not_requested';

update public.user_preferences
set location_opt_in = false,
    updated_at = now();

commit;
