/**
 * Shim (0406): canonical module lives in @xnetjs/workbench. New code
 * imports the package directly.
 */
export {
  activeSpaces,
  toSpaceEntry,
  useSpaceMembers,
  useSpaces,
  type SpaceEntry,
  type SpaceMemberEntry,
  type SpaceMembersApi,
  type SpacesApi
} from '@xnetjs/workbench'
