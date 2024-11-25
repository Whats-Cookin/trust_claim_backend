def split_fixture_data(input_file):
    current_file = None
    node_header = 'id|nodeUri|name|entType|descrip'
    edge_header = 'id|startNodeId|endNodeId|label|claimId'
    claim_header = 'id|subject|claim|object|statement'
    
    nodes = open('nodes.txt', 'w')
    edges = open('edges.txt', 'w')
    claims = open('claims.txt', 'w')
    
    try:
        with open(input_file, 'r') as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                if line == node_header:
                    current_file = nodes
                    continue
                elif line == edge_header:
                    current_file = edges
                    continue
                elif line == claim_header:
                    current_file = claims
                    continue
                if current_file and line:
                    current_file.write(line + '\n')
    finally:
        nodes.close()
        edges.close()
        claims.close()

# Run it
split_fixture_data('fixture_data.txt')
