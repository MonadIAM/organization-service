---@diagnostic disable: undefined-global

local permissions = cjson.decode(ARGV[1])
local global_only = ARGV[2] == "1"
local account = ARGV[3]
local result = { matched = {}, loaded = true, stale = false }

local function covers(revision, expected)
    for partition, required in pairs(expected) do
        local actual = revision[partition]
        if not actual or #actual < #required or (#actual == #required and actual < required) then
            return false
        end
    end
    return true
end

local function required(key)
    local values = redis.call("HMGET", key, "*", account)
    return {
        values[1] and cjson.decode(values[1]) or {},
        values[2] and cjson.decode(values[2]) or {}
    }
end

local function read(key, scope)
    local values = redis.call("HMGET", key, "_revision", "_globalRevision", unpack(permissions))
    if not values[1] then
        result.loaded = false
        return nil
    end
    for index, permission in ipairs(permissions) do
        if values[index + 2] == scope then
            result.matched[permission] = scope
        end
    end
    return values
end

local global = read(KEYS[1], "GLOBAL")
local expected_global
if global then
    expected_global = required(KEYS[3])
    local revision = cjson.decode(global[1])
    result.stale = not covers(revision, expected_global[1]) or not covers(revision, expected_global[2])
end

if not global_only then
    local realm = read(KEYS[2], "REALM")
    if realm then
        local expected = required(KEYS[4])
        local revision = cjson.decode(realm[1])
        if not covers(revision, expected[1]) or not covers(revision, expected[2]) then
            result.stale = true
        end
        if not realm[2] then
            result.loaded = false
        elseif expected_global then
            local dependency = cjson.decode(realm[2])
            if not covers(dependency, expected_global[1]) or not covers(dependency, expected_global[2]) then
                result.stale = true
            end
        end
    end
end

return cjson.encode(result)
