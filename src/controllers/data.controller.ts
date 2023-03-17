import { Signal } from 'signals';

export const processClaimSignal = new Signal<{ data: string }>();

processClaimSignal.add(({claim}) => {
  // create Nodes and Edges from the Claim

  // create a Node for the subject if one does not exist
  // check by subject uri if it already exists

  // create a Node for the claim itself

  // create (or find) a Node for the source 

  // if there is an object, create a Node for the object
  // check by object uri if it already exists

  // create an Edge from the subject node to the claim node labeled with the claim phrase

  // create and Edge from the claim node to the source node with label "source"

  // if there is an object, create an Edge from the subject to the object

  // save all the new Nodes and Edges

  // we might dispatch another process to decorate the new nodes
  // we might retrieve thumbnails from the sites etc

})
