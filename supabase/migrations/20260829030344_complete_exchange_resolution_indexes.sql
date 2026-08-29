create index if not exists exchange_request_resolutions_completed_by_idx
  on public.exchange_request_resolutions (completed_by);

create index if not exists exchange_request_resolutions_outbound_movement_idx
  on public.exchange_request_resolutions (outbound_movement_id)
  where outbound_movement_id is not null;

create index if not exists exchange_request_resolutions_return_movement_idx
  on public.exchange_request_resolutions (return_movement_id)
  where return_movement_id is not null;
