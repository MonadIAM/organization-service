---@diagnostic disable: undefined-global

local partition = ARGV[1]
local offset = ARGV[2]

for first = 3, #ARGV, 64 do
    local fields = {}
    for index = first, math.min(first + 63, #ARGV) do
        table.insert(fields, ARGV[index])
    end
    local values = redis.call("HMGET", KEYS[1], unpack(fields))
    local arguments = {}
    for index, field in ipairs(fields) do
        local revision = values[index] and cjson.decode(values[index]) or {}
        local previous = revision[partition]
        if not previous or #offset > #previous or (#offset == #previous and offset > previous) then
            revision[partition] = offset
            table.insert(arguments, field)
            table.insert(arguments, cjson.encode(revision))
        end
    end
    if #arguments > 0 then
        redis.call("HSET", KEYS[1], unpack(arguments))
    end
end

return 1
