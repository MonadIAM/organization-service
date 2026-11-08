---@diagnostic disable: undefined-global

local snapshot = cjson.decode(ARGV[1])
local ttl = tonumber(ARGV[2])
local global_only = ARGV[3] == "1"
local account = ARGV[4]

local function covers(revision, encoded)
    if not encoded then
        return true
    end
    for partition, required in pairs(cjson.decode(encoded)) do
        local actual = revision[partition]
        if not actual or #actual < #required or (#actual == #required and actual < required) then
            return false
        end
    end
    return true
end

local function expected(key, revision)
    local values = redis.call("HMGET", key, "*", account)
    return covers(revision, values[1]) and covers(revision, values[2])
end

local function write(key, values, revision, global_revision)
    local arguments = { "_revision", cjson.encode(revision) }
    if global_revision then
        table.insert(arguments, "_globalRevision")
        table.insert(arguments, cjson.encode(global_revision))
    end

    redis.call("UNLINK", key)
    for permission, scope in pairs(values) do
        table.insert(arguments, permission)
        table.insert(arguments, scope)
        if #arguments == 128 then
            redis.call("HSET", key, unpack(arguments))
            arguments = {}
        end
    end
    if #arguments > 0 then
        redis.call("HSET", key, unpack(arguments))
    end
    redis.call("PEXPIRE", key, ttl)
end

if not expected(KEYS[3], snapshot.globalRevision)
    or not covers(snapshot.globalRevision, redis.call("HGET", KEYS[1], "_revision")) then
    return 0
end
if not global_only then
    local previous = redis.call("HMGET", KEYS[2], "_revision", "_globalRevision")
    if not expected(KEYS[4], snapshot.revision)
        or not covers(snapshot.revision, previous[1])
        or not covers(snapshot.globalRevision, previous[2]) then
        return 0
    end
end

write(KEYS[1], snapshot.global, snapshot.globalRevision)
if not global_only then
    write(KEYS[2], snapshot.privileges, snapshot.revision, snapshot.globalRevision)
end

return 1
